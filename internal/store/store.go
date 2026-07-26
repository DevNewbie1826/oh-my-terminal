// Package store persists workspaces and terminals to ~/.terminal-hub/state.json.
package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/oh-my-terminal/oh-my-terminal/internal/tmux"
)

var (
	// ErrNotFound is returned when a workspace or terminal does not exist.
	ErrNotFound = errors.New("not found")
	// ErrDuplicate is returned when a tmux session name is already taken.
	ErrDuplicate = errors.New("session name already exists")
	// ErrInvalidLayout is returned when a layout blob is not valid JSON.
	ErrInvalidLayout = errors.New("invalid layout")
)

// Terminal is a single tmux-backed terminal inside a workspace.
type Terminal struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	TmuxSession string `json:"tmuxSession"`
}

// Workspace groups terminals under a name and working directory.
type Workspace struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Path      string     `json:"path"`
	Terminals []Terminal `json:"terminals"`
}

type state struct {
	Workspaces []Workspace     `json:"workspaces"`
	Layout     json.RawMessage `json:"layout,omitempty"`
}

// Store is a mutex-guarded, JSON-backed workspace/terminal repository.
type Store struct {
	path   string
	logger *slog.Logger
	mu     sync.RWMutex
	data   state
}

// StateDir returns the directory used for persistent application state.
func StateDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home directory: %w", err)
	}
	dir := filepath.Join(home, ".terminal-hub")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("creating state directory: %w", err)
	}
	return dir, nil
}

func newID(prefix string) (string, error) {
	raw := make([]byte, 4)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generating id: %w", err)
	}
	return prefix + hex.EncodeToString(raw), nil
}

// Load reads state.json (if present), prunes terminals whose tmux sessions are
// dead, and returns a ready Store.
func Load(ctx context.Context, logger *slog.Logger) (*Store, error) {
	dir, err := StateDir()
	if err != nil {
		return nil, err
	}
	s := &Store{path: filepath.Join(dir, "state.json"), logger: logger}

	raw, err := os.ReadFile(s.path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("reading state file: %w", err)
		}
		s.data.Workspaces = []Workspace{}
		return s, nil
	}
	if err := json.Unmarshal(raw, &s.data); err != nil {
		return nil, fmt.Errorf("parsing state file: %w", err)
	}
	s.pruneDead(ctx)
	return s, nil
}

func (s *Store) pruneDead(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	for i := range s.data.Workspaces {
		ws := &s.data.Workspaces[i]
		alive := ws.Terminals[:0]
		for _, t := range ws.Terminals {
			exists, err := tmux.HasSession(ctx, t.TmuxSession)
			if err != nil {
				s.logger.Warn("checking tmux session", "session", t.TmuxSession, "err", err)
				alive = append(alive, t)
				continue
			}
			if exists {
				alive = append(alive, t)
			} else {
				s.logger.Info("pruning dead terminal", "workspace", ws.Name, "terminal", t.Name)
				changed = true
			}
		}
		ws.Terminals = alive
	}
	if changed {
		if err := s.flushLocked(); err != nil {
			s.logger.Error("flushing state after prune", "err", err)
		}
	}
}

// flushLocked writes the state file atomically. Callers must hold s.mu.
func (s *Store) flushLocked() error {
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding state: %w", err)
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return fmt.Errorf("writing state file: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return fmt.Errorf("replacing state file: %w", err)
	}
	return nil
}

// ListWorkspaces returns a deep snapshot of all workspaces.
func (s *Store) ListWorkspaces() []Workspace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Workspace, len(s.data.Workspaces))
	for i, ws := range s.data.Workspaces {
		out[i] = copyWorkspace(ws)
	}
	return out
}

func (s *Store) findWorkspaceLocked(id string) *Workspace {
	for i := range s.data.Workspaces {
		if s.data.Workspaces[i].ID == id {
			return &s.data.Workspaces[i]
		}
	}
	return nil
}

// GetWorkspace returns a deep copy of one workspace.
func (s *Store) GetWorkspace(id string) (Workspace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ws := s.findWorkspaceLocked(id)
	if ws == nil {
		return Workspace{}, ErrNotFound
	}
	return copyWorkspace(*ws), nil
}

func copyWorkspace(ws Workspace) Workspace {
	terms := make([]Terminal, len(ws.Terminals))
	copy(terms, ws.Terminals)
	ws.Terminals = terms
	return ws
}

// CreateWorkspace appends a workspace and flushes.
func (s *Store) CreateWorkspace(name, path string) (Workspace, error) {
	id, err := newID("ws-")
	if err != nil {
		return Workspace{}, err
	}
	ws := Workspace{ID: id, Name: name, Path: path, Terminals: []Terminal{}}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Workspaces = append(s.data.Workspaces, ws)
	if err := s.flushLocked(); err != nil {
		return Workspace{}, err
	}
	return ws, nil
}

// DeleteWorkspace removes a workspace from state. Killing tmux sessions is the
// caller's responsibility.
func (s *Store) DeleteWorkspace(id string) (Workspace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ws := s.findWorkspaceLocked(id)
	if ws == nil {
		return Workspace{}, ErrNotFound
	}
	removed := *ws
	for i := range s.data.Workspaces {
		if s.data.Workspaces[i].ID == id {
			s.data.Workspaces = append(s.data.Workspaces[:i], s.data.Workspaces[i+1:]...)
			break
		}
	}
	if err := s.flushLocked(); err != nil {
		return Workspace{}, err
	}
	return removed, nil
}

// RenameWorkspace updates a workspace's display name.
func (s *Store) RenameWorkspace(id, name string) (Workspace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ws := s.findWorkspaceLocked(id)
	if ws == nil {
		return Workspace{}, ErrNotFound
	}
	ws.Name = name
	if err := s.flushLocked(); err != nil {
		return Workspace{}, err
	}
	return *ws, nil
}

// GetLayout returns a copy of the stored layout blob, or nil if none is set.
func (s *Store) GetLayout() json.RawMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.data.Layout) == 0 {
		return nil
	}
	out := make(json.RawMessage, len(s.data.Layout))
	copy(out, s.data.Layout)
	return out
}

// SetLayout stores a copy of the layout blob and flushes. The blob must be
// valid JSON; the server never interprets its contents.
func (s *Store) SetLayout(raw json.RawMessage) error {
	if !json.Valid(raw) {
		return ErrInvalidLayout
	}
	stored := make(json.RawMessage, len(raw))
	copy(stored, raw)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Layout = stored
	return s.flushLocked()
}
