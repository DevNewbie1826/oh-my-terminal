// Package daemon manages background oh-my-terminal server processes.
package daemon

import (
	"errors"
	"os"

	"github.com/oh-my-terminal/oh-my-terminal/internal/config"
)

// Child holds the lock file owned by a daemon child process.
type Child struct {
	lockFile    *os.File
	readyWriter *os.File
	pidPath     string
}

var (
	// ErrNotRunning reports that no live daemon process owns the PID file.
	ErrNotRunning = errors.New("oh-my-terminal is not running")
	// ErrUnsupported reports that the host cannot manage daemon processes.
	ErrUnsupported = errors.New("daemon mode is not supported on this platform")
)

// Start launches a detached child server and waits until it has bound its
// listener and taken ownership.
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

// PrepareChild validates the inherited lock and readiness-pipe descriptors.
func PrepareChild() (*Child, error) {
	return prepareChild()
}

// Ready records daemon ownership and reports a bound listener to the parent.
func (c *Child) Ready() error {
	return childReady(c)
}

// Close releases the child lock file.
func (c *Child) Close() error {
	return closeChild(c)
}
