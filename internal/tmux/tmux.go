// Package tmux wraps the tmux CLI for session lifecycle management.
package tmux

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

const maxSessionLength = 64

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

// EnableMouse turns on tmux mouse support so a web terminal can scroll the
// tmux scrollback (copy-mode) with the wheel or touch. tmux runs on the
// alternate screen, which has no scrollback of its own; without mouse mode a
// terminal emulator converts wheel/touch drags into arrow keys that tmux
// ignores, so scrolling appears dead. Failures are non-fatal: the session
// still attaches, just without mouse scrolling.
func EnableMouse(ctx context.Context) error {
	_, err := run(ctx, "set-option", "-g", "mouse", "on")
	return err
}

// EnableSetClipboard enables tmux clipboard integration.
func EnableSetClipboard(ctx context.Context) error {
	_, err := run(ctx, "set-option", "-g", "set-clipboard", "on")
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
