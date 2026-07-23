// Package tmux wraps the tmux CLI for session lifecycle management.
package tmux

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

const (
	maxSessionLength = 64
	listSeparator    = "\x1f" // unit separator, never appears in session names
)

// Session is one row of `tmux list-sessions`.
type Session struct {
	Name     string `json:"name"`
	Attached bool   `json:"attached"`
}

// SanitizeSessionName normalizes a user-supplied name into a valid tmux session
// name: dots, colons and spaces become dashes, capped at 64 chars.
func SanitizeSessionName(name string) string {
	s := strings.TrimSpace(name)
	replacer := strings.NewReplacer(".", "-", ":", "-", " ", "-")
	s = replacer.Replace(s)
	if len(s) > maxSessionLength {
		s = s[:maxSessionLength]
	}
	return s
}

func run(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "tmux", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("tmux %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

// NewSession starts a detached tmux session with the given working directory.
func NewSession(ctx context.Context, name, workdir string) error {
	_, err := run(ctx, "new-session", "-d", "-s", name, "-c", workdir)
	return err
}

// KillSession terminates a session; killing a missing session is not an error.
func KillSession(ctx context.Context, name string) error {
	out, err := run(ctx, "kill-session", "-t", name)
	if err != nil {
		if strings.Contains(out, "can't find session") {
			return nil
		}
		return err
	}
	return nil
}

// HasSession reports whether the named session exists.
func HasSession(ctx context.Context, name string) (bool, error) {
	cmd := exec.CommandContext(ctx, "tmux", "has-session", "-t", name)
	err := cmd.Run()
	if err == nil {
		return true, nil
	}
	if _, ok := err.(*exec.ExitError); ok {
		return false, nil
	}
	return false, fmt.Errorf("checking tmux session %q: %w", name, err)
}

// RenameSession renames an existing session.
func RenameSession(ctx context.Context, oldName, newName string) error {
	_, err := run(ctx, "rename-session", "-t", oldName, newName)
	return err
}

// ListSessions lists all tmux sessions on the server.
func ListSessions(ctx context.Context) ([]Session, error) {
	format := "#S" + listSeparator + "#{session_attached}"
	out, err := run(ctx, "list-sessions", "-F", format)
	if err != nil {
		// A missing server means zero sessions.
		if strings.Contains(out, "no server running") || strings.Contains(out, "error connecting") {
			return nil, nil
		}
		return nil, err
	}
	var sessions []Session
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, listSeparator, 2)
		s := Session{Name: parts[0]}
		if len(parts) == 2 && parts[1] != "0" {
			s.Attached = true
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}
