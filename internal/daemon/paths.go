package daemon

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/oh-my-terminal/oh-my-terminal/internal/store"
)

const (
	pidFileName = "oh-my-terminal.pid"
	logFileName = "oh-my-terminal.log"
)

func daemonPaths() (string, string, error) {
	dir, err := store.StateDir()
	if err != nil {
		return "", "", err
	}
	return filepath.Join(dir, pidFileName), filepath.Join(dir, logFileName), nil
}

func readPIDFile(path string) (int, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, ErrNotRunning
		}
		return 0, fmt.Errorf("reading pid file: %w", err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil || pid <= 0 {
		return 0, fmt.Errorf("%w: invalid pid file", ErrNotRunning)
	}
	return pid, nil
}

func writePIDFile(path string, pid int) error {
	if pid <= 0 {
		return fmt.Errorf("writing pid file: invalid pid %d", pid)
	}
	if err := os.WriteFile(path, []byte(strconv.Itoa(pid)+"\n"), 0o600); err != nil {
		return fmt.Errorf("writing pid file: %w", err)
	}
	return nil
}

func removePIDFile(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("removing pid file: %w", err)
	}
	return nil
}

// RemoveChildPIDFile removes this child process's PID file, if it still owns
// it. A newer daemon PID file is left untouched.
func RemoveChildPIDFile() error {
	path, _, err := daemonPaths()
	if err != nil {
		return err
	}
	pid, err := readPIDFile(path)
	if errors.Is(err, ErrNotRunning) {
		return nil
	}
	if err != nil {
		return err
	}
	if pid != os.Getpid() {
		return nil
	}
	return removePIDFile(path)
}
