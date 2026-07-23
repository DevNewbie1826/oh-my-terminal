// Package api implements the HTTP API, WebSocket bridge, and static serving.
package api

import (
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"path"
	"strings"

	"github.com/lxzan/gws"

	"github.com/oh-my-terminal/oh-my-terminal/frontend"
	"github.com/oh-my-terminal/oh-my-terminal/internal/auth"
	"github.com/oh-my-terminal/oh-my-terminal/internal/config"
	"github.com/oh-my-terminal/oh-my-terminal/internal/store"
)

// Server holds shared dependencies for all HTTP handlers.
type Server struct {
	gws.BuiltinEventHandler
	cfg      *config.Config
	store    *store.Store
	sessions *auth.SessionStore
	logger   *slog.Logger
	upgrader *gws.Upgrader
}

// New creates the API server.
func New(cfg *config.Config, st *store.Store, sessions *auth.SessionStore, logger *slog.Logger) *Server {
	s := &Server{cfg: cfg, store: st, sessions: sessions, logger: logger}
	s.upgrader = gws.NewUpgrader(s, &gws.ServerOption{Recovery: gws.Recovery})
	return s
}

// Handler builds the root mux: public login, authenticated /api/*, static SPA.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/login", s.handleLogin)

	protected := http.NewServeMux()
	protected.HandleFunc("POST /api/logout", s.handleLogout)
	protected.HandleFunc("GET /api/auth/check", s.handleAuthCheck)

	protected.HandleFunc("GET /api/workspaces", s.handleListWorkspaces)
	protected.HandleFunc("POST /api/workspaces", s.handleCreateWorkspace)
	protected.HandleFunc("DELETE /api/workspaces/{wsId}", s.handleDeleteWorkspace)
	protected.HandleFunc("PATCH /api/workspaces/{wsId}", s.handleRenameWorkspace)

	protected.HandleFunc("GET /api/workspaces/{wsId}/terminals", s.handleListTerminals)
	protected.HandleFunc("POST /api/workspaces/{wsId}/terminals", s.handleCreateTerminal)
	protected.HandleFunc("DELETE /api/workspaces/{wsId}/terminals/{tmId}", s.handleDeleteTerminal)
	protected.HandleFunc("PATCH /api/workspaces/{wsId}/terminals/{tmId}", s.handleRenameTerminal)
	protected.HandleFunc("GET /api/workspaces/{wsId}/terminals/{tmId}/attach-cmd", s.handleAttachCmd)
	protected.HandleFunc("POST /api/workspaces/{wsId}/terminals/{tmId}/upload", s.handleUpload)
	protected.HandleFunc("GET /api/workspaces/{wsId}/terminals/{tmId}/ws", s.handleWS)

	protected.HandleFunc("GET /api/fs/browse", s.handleBrowse)
	protected.HandleFunc("GET /api/fs/list", s.handleList)
	protected.HandleFunc("GET /api/fs/download", s.handleDownload)
	protected.HandleFunc("GET /api/fs/read", s.handleReadFile)
	protected.HandleFunc("POST /api/fs/write", s.handleWriteFile)

	protected.HandleFunc("GET /api/layout", s.handleGetLayout)
	protected.HandleFunc("PUT /api/layout", s.handleSetLayout)

	mux.Handle("/api/", s.sessions.Middleware(protected))
	mux.Handle("/", s.staticHandler())
	return mux
}

// staticHandler serves the embedded frontend with SPA fallback to index.html.
func (s *Server) staticHandler() http.Handler {
	sub, err := fs.Sub(frontend.Dist, "dist")
	if err != nil {
		s.logger.Error("embedded frontend missing dist/", "err", err)
		return http.NotFoundHandler()
	}
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleaned := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if _, err := fs.Stat(sub, cleaned); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		index, err := fs.ReadFile(sub, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(index)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20) // 1 MiB
	return json.NewDecoder(r.Body).Decode(v)
}

// writeStoreError maps store sentinel errors to HTTP responses.
func (s *Server) writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, store.ErrDuplicate):
		writeError(w, http.StatusConflict, "name already in use")
	default:
		s.logger.Error("store operation failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
	}
}

// clientIP extracts the client address from the TCP connection.
// X-Forwarded-For is intentionally NOT trusted — there is no trusted-proxy
// configuration, so honoring it would let any client spoof their IP and
// bypass per-IP rate limiting.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
