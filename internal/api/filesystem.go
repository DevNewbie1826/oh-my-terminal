package api

import (
	"bytes"
	"errors"
	"io"
	"io/fs"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const (
	maxUploadBytes = 100 << 20 // 100 MiB
	maxReadBytes   = 2 << 20   // 2 MiB
	// maxWriteBytes must be >= maxReadBytes so any file the editor can load
	// can also be saved back.
	maxWriteBytes   = maxReadBytes
	binaryScanBytes = 1024
)

type dirEntry struct {
	Name    string    `json:"name"`
	IsDir   bool      `json:"isDir"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
}

// handleBrowse lists directories only (for the folder picker).
func (s *Server) handleBrowse(w http.ResponseWriter, r *http.Request) {
	dir, err := s.resolvePath(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		s.writeFsError(w, err)
		return
	}
	dirs := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, e.Name())
		}
	}
	sort.Strings(dirs)
	writeJSON(w, http.StatusOK, map[string]any{
		"path":   dir,
		"parent": parentOf(dir),
		"dirs":   dirs,
	})
}

// handleList lists files and directories (for the file browser).
func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	dir, err := s.resolvePath(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		s.writeFsError(w, err)
		return
	}
	list := make([]dirEntry, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			s.logger.Warn("stat failed", "path", filepath.Join(dir, e.Name()), "err", err)
			continue
		}
		list = append(list, dirEntry{
			Name:    e.Name(),
			IsDir:   e.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime(),
		})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].IsDir != list[j].IsDir {
			return list[i].IsDir
		}
		return list[i].Name < list[j].Name
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"path":    dir,
		"parent":  parentOf(dir),
		"entries": list,
	})
}

// handleDownload streams a single file.
func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	target, err := s.resolvePath(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	info, err := os.Stat(target)
	if err != nil {
		s.writeFsError(w, err)
		return
	}
	if info.IsDir() {
		writeError(w, http.StatusBadRequest, "path is a directory")
		return
	}
	f, err := os.Open(target)
	if err != nil {
		s.writeFsError(w, err)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filepath.Base(target)}))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeContent(w, r, filepath.Base(target), info.ModTime(), f)
}

// handleReadFile returns a text file's content for the in-app editor.
// Rejects directories, oversized files, and binary content.
func (s *Server) handleReadFile(w http.ResponseWriter, r *http.Request) {
	target, err := s.resolvePath(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	info, err := os.Stat(target)
	if err != nil {
		s.writeFsError(w, err)
		return
	}
	if info.IsDir() {
		writeError(w, http.StatusBadRequest, "path is a directory")
		return
	}
	f, err := os.Open(target)
	if err != nil {
		s.writeFsError(w, err)
		return
	}
	defer f.Close()
	// Read at most maxReadBytes+1 so a file that grows between the size check
	// and the read can never cause an unbounded allocation.
	data, err := io.ReadAll(io.LimitReader(f, maxReadBytes+1))
	if err != nil {
		s.writeFsError(w, err)
		return
	}
	if len(data) > maxReadBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "file too large to edit")
		return
	}
	if isBinary(data) {
		writeError(w, http.StatusUnsupportedMediaType, "binary file cannot be edited")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"content": string(data), "size": len(data)})
}

// handleWriteFile saves editor content back to a file atomically.
func (s *Server) handleWriteFile(w http.ResponseWriter, r *http.Request) {
	target, err := s.resolvePath(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxWriteBytes+4096)
	var req struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Content) > maxWriteBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "content too large to save")
		return
	}
	if err := writeFileAtomic(target, []byte(req.Content)); err != nil {
		s.writeFsError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// isBinary reports whether data looks like binary content (NUL in the head).
func isBinary(data []byte) bool {
	head := data
	if len(head) > binaryScanBytes {
		head = head[:binaryScanBytes]
	}
	return bytes.IndexByte(head, 0) >= 0
}

// writeFileAtomic writes data to a temp file in the same directory, fsyncs,
// then renames over the target so readers never observe a partial write.
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".th-edit-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() {
		if tmpName != "" {
			_ = os.Remove(tmpName)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	mode := os.FileMode(0o644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode().Perm()
	}
	if err := os.Chmod(tmpName, mode); err != nil {
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return err
	}
	tmpName = ""
	// Fsync the directory so the rename itself is durable, not just the data.
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}

// handleUpload stores multipart "files" fields into the workspace directory.
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	ws, err := s.store.GetWorkspace(r.PathValue("wsId"))
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	if _, err := s.store.GetTerminal(ws.ID, r.PathValue("tmId")); err != nil {
		s.writeStoreError(w, err)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		writeError(w, http.StatusBadRequest, `no "files" field in multipart form`)
		return
	}
	uploaded := make([]string, 0, len(files))
	for _, fh := range files {
		if err := saveUpload(fh, ws.Path); err != nil {
			s.logger.Error("saving upload", "file", fh.Filename, "err", err)
			writeError(w, http.StatusInternalServerError, "failed to save "+fh.Filename)
			return
		}
		uploaded = append(uploaded, filepath.Base(fh.Filename))
	}
	writeJSON(w, http.StatusOK, map[string]any{"uploaded": uploaded})
}

func saveUpload(fh *multipart.FileHeader, destDir string) error {
	src, err := fh.Open()
	if err != nil {
		return err
	}
	defer src.Close()
	name := filepath.Base(filepath.Clean(fh.Filename))
	if name == "" || name == "." || name == ".." {
		return errors.New("invalid filename")
	}
	dst, err := os.OpenFile(filepath.Join(destDir, name), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	return err
}

// parentOf returns the parent directory, or nil at the root boundary.
func parentOf(dir string) any {
	parent := filepath.Dir(dir)
	if parent == dir {
		return nil
	}
	return parent
}

func (s *Server) writeFsError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		writeError(w, http.StatusNotFound, "path not found")
	case errors.Is(err, fs.ErrPermission):
		writeError(w, http.StatusForbidden, "permission denied")
	default:
		s.logger.Error("filesystem operation failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
	}
}
