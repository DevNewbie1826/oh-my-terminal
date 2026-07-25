//go:build darwin || linux

package daemon

import (
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"github.com/oh-my-terminal/oh-my-terminal/internal/config"
)

const (
	startTimeout = 3 * time.Second
	stopTimeout  = 5 * time.Second
	pollInterval = 50 * time.Millisecond
)

func start(cfg *config.Config, args []string) (int, string, error) {
	pidPath, logPath, err := daemonPaths()
	if err != nil {
		return 0, "", err
	}
	if err := removeStalePIDFile(pidPath); err != nil {
		return 0, "", err
	}

	logFile, err := os.OpenFile(logPath, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o600)
	if err != nil {
		return 0, "", fmt.Errorf("opening daemon log file: %w", err)
	}
	defer logFile.Close()
	stdin, err := os.Open(os.DevNull)
	if err != nil {
		return 0, "", fmt.Errorf("opening %s: %w", os.DevNull, err)
	}
	defer stdin.Close()

	executable, err := os.Executable()
	if err != nil {
		return 0, "", fmt.Errorf("resolving executable: %w", err)
	}
	cmd := exec.Command(executable, daemonChildArgs(args)...)
	cmd.Stdin = stdin
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return 0, "", fmt.Errorf("starting daemon child: %w", err)
	}

	pid := cmd.Process.Pid
	if err := writePIDFile(pidPath, pid); err != nil {
		killAndWait(cmd.Process)
		return 0, "", err
	}
	addr := net.JoinHostPort(cfg.Host, fmt.Sprint(cfg.Port))
	if err := waitForReady(cmd.Process, addr); err != nil {
		killAndWait(cmd.Process)
		if removeErr := removePIDFile(pidPath); removeErr != nil {
			return 0, "", removeErr
		}
		return 0, "", fmt.Errorf("daemon failed to start; see %s: %w", logPath, err)
	}
	return pid, addr, nil
}

func stop() (int, error) {
	pidPath, _, err := daemonPaths()
	if err != nil {
		return 0, err
	}
	pid, err := readPIDFile(pidPath)
	if err != nil {
		return notRunning(pidPath, err)
	}
	if !processAlive(pid) {
		return notRunning(pidPath, ErrNotRunning)
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
		if errors.Is(err, syscall.ESRCH) {
			return notRunning(pidPath, ErrNotRunning)
		}
		return 0, fmt.Errorf("sending SIGTERM to pid %d: %w", pid, err)
	}
	if err := waitForExit(pid, stopTimeout); err != nil {
		if killErr := syscall.Kill(pid, syscall.SIGKILL); killErr != nil && !errors.Is(killErr, syscall.ESRCH) {
			return 0, fmt.Errorf("sending SIGKILL to pid %d: %w", pid, killErr)
		}
	}
	if err := removePIDFile(pidPath); err != nil {
		return 0, err
	}
	return pid, nil
}

func status() (int, error) {
	pidPath, _, err := daemonPaths()
	if err != nil {
		return 0, err
	}
	pid, err := readPIDFile(pidPath)
	if err != nil || !processAlive(pid) {
		return notRunning(pidPath, err)
	}
	return pid, nil
}

func removeStalePIDFile(path string) error {
	pid, err := readPIDFile(path)
	if err == nil && processAlive(pid) {
		return fmt.Errorf("already running (pid %d)", pid)
	}
	if err != nil && !errors.Is(err, ErrNotRunning) {
		return err
	}
	return removePIDFile(path)
}

func notRunning(path string, cause error) (int, error) {
	if err := removePIDFile(path); err != nil {
		return 0, err
	}
	if cause == nil || errors.Is(cause, ErrNotRunning) {
		return 0, ErrNotRunning
	}
	return 0, fmt.Errorf("checking daemon status: %w", cause)
}

func daemonChildArgs(args []string) []string {
	childArgs := make([]string, len(args))
	for i, arg := range args {
		switch {
		case arg == "--daemon":
			childArgs[i] = "--daemon-child"
		case strings.HasPrefix(arg, "--daemon="):
			childArgs[i] = "--daemon-child=" + strings.TrimPrefix(arg, "--daemon=")
		default:
			childArgs[i] = arg
		}
	}
	return childArgs
}

func waitForReady(process *os.Process, addr string) error {
	deadline := time.NewTimer(startTimeout)
	defer deadline.Stop()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		conn, err := net.DialTimeout("tcp", addr, pollInterval)
		if err == nil {
			conn.Close()
			return nil
		}
		if !processAlive(process.Pid) {
			return errors.New("daemon child exited before accepting connections")
		}
		select {
		case <-deadline.C:
			return errors.New("timed out waiting for daemon to accept connections")
		case <-ticker.C:
		}
	}
}

func waitForExit(pid int, timeout time.Duration) error {
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for processAlive(pid) {
		select {
		case <-deadline.C:
			return errors.New("timed out waiting for daemon to stop")
		case <-ticker.C:
		}
	}
	return nil
}

func killAndWait(process *os.Process) {
	_ = process.Kill()
	_, _ = process.Wait()
}

func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}
