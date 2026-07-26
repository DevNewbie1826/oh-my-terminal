package store

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oh-my-terminal/oh-my-terminal/internal/tmux"
)

func TestDefaultTerminalNameStopsAfterMaximumAttempts(t *testing.T) {
	folder := strings.Repeat("a", 64)
	candidate := tmux.SanitizeSessionName(folder + "-1")
	s := &Store{data: state{Workspaces: []Workspace{{
		Terminals: []Terminal{{TmuxSession: candidate}},
	}}}}

	_, err := s.DefaultTerminalName(context.Background(), &Workspace{Path: filepath.Join(t.TempDir(), folder)})
	if err == nil {
		t.Fatal("DefaultTerminalName() error = nil, want capped-attempts error")
	}
	if !strings.Contains(err.Error(), "no available terminal name") {
		t.Fatalf("DefaultTerminalName() error = %q, want clear availability error", err)
	}
}
