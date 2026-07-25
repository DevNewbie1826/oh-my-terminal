// Package daemon manages background oh-my-terminal server processes.
package daemon

import (
	"errors"

	"github.com/oh-my-terminal/oh-my-terminal/internal/config"
)

var (
	// ErrNotRunning reports that no live daemon process owns the PID file.
	ErrNotRunning = errors.New("oh-my-terminal is not running")
	// ErrUnsupported reports that the host cannot manage daemon processes.
	ErrUnsupported = errors.New("daemon mode is not supported on this platform")
)

// Start launches a detached child server and waits for it to accept requests.
func Start(cfg *config.Config, args []string) (int, string, error) {
	return start(cfg, args)
}

// Stop terminates the running daemon process.
func Stop() (int, error) {
	return stop()
}

// Status returns the live daemon process ID.
func Status() (int, error) {
	return status()
}
