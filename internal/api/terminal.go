package api

import (
	"fmt"
	"net/http"

	"github.com/oh-my-terminal/oh-my-terminal/internal/store"
	"github.com/oh-my-terminal/oh-my-terminal/internal/tmux"
)

type createTerminalRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleListTerminals(w http.ResponseWriter, r *http.Request) {
	ws, err := s.store.GetWorkspace(r.PathValue("wsId"))
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ws.Terminals)
}

func (s *Server) handleCreateTerminal(w http.ResponseWriter, r *http.Request) {
	wsID := r.PathValue("wsId")
	ws, err := s.store.GetWorkspace(wsID)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	var req createTerminalRequest
	_ = decodeJSON(r, &req) // empty body is allowed → default name

	name := tmux.SanitizeSessionName(req.Name)
	if name == "" {
		name, err = s.store.DefaultTerminalName(r.Context(), &ws)
		if err != nil {
			s.writeStoreError(w, err)
			return
		}
	} else {
		exists, err := tmux.HasSession(r.Context(), name)
		if err != nil {
			s.writeStoreError(w, err)
			return
		}
		if exists {
			s.writeStoreError(w, store.ErrDuplicate)
			return
		}
	}

	if err := tmux.NewSession(r.Context(), name, ws.Path); err != nil {
		s.logger.Error("creating tmux session", "session", name, "err", err)
		writeError(w, http.StatusInternalServerError, "failed to start tmux session")
		return
	}

	tmID, err := store.NewTerminalID()
	if err != nil {
		_ = tmux.KillSession(r.Context(), name)
		s.writeStoreError(w, err)
		return
	}
	terminal := store.Terminal{ID: tmID, Name: name, TmuxSession: name}
	if err := s.store.AddTerminal(wsID, terminal); err != nil {
		_ = tmux.KillSession(r.Context(), name)
		s.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, terminal)
}

func (s *Server) handleDeleteTerminal(w http.ResponseWriter, r *http.Request) {
	wsID, tmID := r.PathValue("wsId"), r.PathValue("tmId")
	terminal, err := s.store.GetTerminal(wsID, tmID)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	if err := tmux.KillSession(r.Context(), terminal.TmuxSession); err != nil {
		s.logger.Warn("killing tmux session", "session", terminal.TmuxSession, "err", err)
	}
	if _, err := s.store.RemoveTerminal(wsID, tmID); err != nil {
		s.writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRenameTerminal(w http.ResponseWriter, r *http.Request) {
	wsID, tmID := r.PathValue("wsId"), r.PathValue("tmId")
	terminal, err := s.store.GetTerminal(wsID, tmID)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}

	var req renameRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	newName := tmux.SanitizeSessionName(req.Name)
	if newName == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if newName == terminal.TmuxSession {
		writeJSON(w, http.StatusOK, terminal)
		return
	}
	exists, err := tmux.HasSession(r.Context(), newName)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	if exists {
		s.writeStoreError(w, store.ErrDuplicate)
		return
	}
	if err := tmux.RenameSession(r.Context(), terminal.TmuxSession, newName); err != nil {
		s.logger.Error("renaming tmux session", "from", terminal.TmuxSession, "to", newName, "err", err)
		writeError(w, http.StatusInternalServerError, "failed to rename tmux session")
		return
	}
	updated, err := s.store.RenameTerminal(wsID, tmID, newName, newName)
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleAttachCmd(w http.ResponseWriter, r *http.Request) {
	terminal, err := s.store.GetTerminal(r.PathValue("wsId"), r.PathValue("tmId"))
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"command": fmt.Sprintf("tmux new-session -t %q", terminal.TmuxSession),
	})
}
