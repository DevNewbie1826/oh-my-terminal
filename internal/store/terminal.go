package store

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/oh-my-terminal/oh-my-terminal/internal/tmux"
)

func findTerminalLocked(ws *Workspace, id string) *Terminal {
	for i := range ws.Terminals {
		if ws.Terminals[i].ID == id {
			return &ws.Terminals[i]
		}
	}
	return nil
}

// GetTerminal returns a copy of one terminal.
func (s *Store) GetTerminal(wsID, tmID string) (Terminal, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ws := s.findWorkspaceLocked(wsID)
	if ws == nil {
		return Terminal{}, ErrNotFound
	}
	t := findTerminalLocked(ws, tmID)
	if t == nil {
		return Terminal{}, ErrNotFound
	}
	return *t, nil
}

// AddTerminal appends a terminal to a workspace and flushes.
func (s *Store) AddTerminal(wsID string, t Terminal) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ws := s.findWorkspaceLocked(wsID)
	if ws == nil {
		return ErrNotFound
	}
	ws.Terminals = append(ws.Terminals, t)
	return s.flushLocked()
}

// RemoveTerminal deletes a terminal from a workspace and flushes.
func (s *Store) RemoveTerminal(wsID, tmID string) (Terminal, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ws := s.findWorkspaceLocked(wsID)
	if ws == nil {
		return Terminal{}, ErrNotFound
	}
	t := findTerminalLocked(ws, tmID)
	if t == nil {
		return Terminal{}, ErrNotFound
	}
	removed := *t
	for i := range ws.Terminals {
		if ws.Terminals[i].ID == tmID {
			ws.Terminals = append(ws.Terminals[:i], ws.Terminals[i+1:]...)
			break
		}
	}
	if err := s.flushLocked(); err != nil {
		return Terminal{}, err
	}
	return removed, nil
}

// RenameTerminal updates a terminal's name and tmux session reference.
func (s *Store) RenameTerminal(wsID, tmID, name, tmuxSession string) (Terminal, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ws := s.findWorkspaceLocked(wsID)
	if ws == nil {
		return Terminal{}, ErrNotFound
	}
	t := findTerminalLocked(ws, tmID)
	if t == nil {
		return Terminal{}, ErrNotFound
	}
	t.Name = name
	t.TmuxSession = tmuxSession
	if err := s.flushLocked(); err != nil {
		return Terminal{}, err
	}
	return *t, nil
}

// NewTerminalID generates a terminal ID for the API layer.
func NewTerminalID() (string, error) {
	return newID("tm-")
}

const maxTerminalNameAttempts = 1000

// DefaultTerminalName picks "<folder>-N" with the next free N, avoiding
// collisions with existing tmux sessions.
func (s *Store) DefaultTerminalName(ctx context.Context, ws *Workspace) (string, error) {
	folder := filepath.Base(filepath.Clean(ws.Path))
	if folder == "" || folder == "." || folder == string(filepath.Separator) {
		folder = "terminal"
	}
	s.mu.RLock()
	taken := make(map[string]bool)
	for _, w := range s.data.Workspaces {
		for _, t := range w.Terminals {
			taken[t.TmuxSession] = true
		}
	}
	s.mu.RUnlock()

	for n := 1; n <= maxTerminalNameAttempts; n++ {
		candidate := tmux.SanitizeSessionName(fmt.Sprintf("%s-%d", folder, n))
		if taken[candidate] {
			continue
		}
		exists, err := tmux.HasSession(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("no available terminal name after %d attempts", maxTerminalNameAttempts)
}
