//go:build darwin || linux

package daemon

import (
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
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
	pidPath, logPath, lockPath, err := daemonPaths()
	if err != nil {
		return 0, "", err
	}
	lockFile, err := openLockFile(lockPath)
	if err != nil {
		return 0, "", err
	}
	if err := syscall.Flock(int(lockFile.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = lockFile.Close()
		if isLockHeld(err) {
			pid, _ := readPIDFile(pidPath)
			return 0, "", fmt.Errorf("already running (pid %d)", pid)
		}
		return 0, "", fmt.Errorf("locking daemon state: %w", err)
	}
	defer func() { _ = lockFile.Close() }()

	if err := removePIDFile(pidPath); err != nil {
		return 0, "", err
	}
	logFile, err := os.OpenFile(logPath, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o600)
	if err != nil {
		return 0, "", fmt.Errorf("opening daemon log file: %w", err)
	}
	defer func() { _ = logFile.Close() }()
	stdin, err := os.Open(os.DevNull)
	if err != nil {
		return 0, "", fmt.Errorf("opening %s: %w", os.DevNull, err)
	}
	defer func() { _ = stdin.Close() }()
	readyReader, readyWriter, err := os.Pipe()
	if err != nil {
		return 0, "", fmt.Errorf("creating daemon readiness pipe: %w", err)
	}
	defer func() { _ = readyReader.Close() }()

	executable, err := os.Executable()
	if err != nil {
		_ = readyWriter.Close()
		return 0, "", fmt.Errorf("resolving executable: %w", err)
	}
	cmd := exec.Command(executable, args...)
	cmd.Env = append(os.Environ(), "TH_DAEMON_CHILD=1")
	cmd.Stdin = stdin
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.ExtraFiles = []*os.File{readyWriter}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		_ = readyWriter.Close()
		return 0, "", fmt.Errorf("starting daemon child: %w", err)
	}
	_ = readyWriter.Close()

	if err := waitForReady(readyReader); err != nil {
		killAndWait(cmd.Process)
		if removeErr := removePIDFile(pidPath); removeErr != nil {
			return 0, "", removeErr
		}
		return 0, "", fmt.Errorf("daemon failed to start; see %s", logPath)
	}
	pid := cmd.Process.Pid
	if err := writePIDFile(pidPath, pid); err != nil {
		killAndWait(cmd.Process)
		if removeErr := removePIDFile(pidPath); removeErr != nil {
			return 0, "", removeErr
		}
		return 0, "", err
	}
	// A concurrent start in the handoff window may launch a child, which either
	// fails to bind or waits for this daemon's lock after the parent exits.
	return pid, net.JoinHostPort(cfg.Host, fmt.Sprint(cfg.Port)), nil
}

func stop() (int, error) {
	pidPath, _, lockPath, err := daemonPaths()
	if err != nil {
		return 0, err
	}
	held, err := probeLock(lockPath)
	if err != nil {
		return 0, err
	}
	if !held {
		return notRunning(pidPath, ErrNotRunning)
	}
	pid, err := readPIDFile(pidPath)
	if err != nil {
		return 0, fmt.Errorf("reading daemon pid: %w", err)
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
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
	pidPath, _, lockPath, err := daemonPaths()
	if err != nil {
		return 0, err
	}
	held, err := probeLock(lockPath)
	if err != nil {
		return 0, err
	}
	if held {
		pid, err := readPIDFile(pidPath)
		if err != nil {
			return 0, nil
		}
		return pid, nil
	}
	return notRunning(pidPath, ErrNotRunning)
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

func prepareChild() (*Child, error) {
	pidPath, _, lockPath, err := daemonPaths()
	if err != nil {
		return nil, err
	}
	lockFile, err := openLockFile(lockPath)
	if err != nil {
		return nil, err
	}
	return &Child{lockFile: lockFile, pidPath: pidPath}, nil
}

func childReady(child *Child) {
	signalReady()
	if syscall.Flock(int(child.lockFile.Fd()), syscall.LOCK_EX) != nil {
		return
	}
	_ = writePIDFile(child.pidPath, os.Getpid())
}

func closeChild(child *Child) error {
	return child.lockFile.Close()
}

func openLockFile(path string) (*os.File, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("opening daemon lock file: %w", err)
	}
	return file, nil
}

func probeLock(path string) (bool, error) {
	file, err := openLockFile(path)
	if err != nil {
		return false, err
	}
	defer func() { _ = file.Close() }()
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		if isLockHeld(err) {
			return true, nil
		}
		return false, fmt.Errorf("probing daemon lock: %w", err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_UN); err != nil {
		return false, fmt.Errorf("unlocking daemon lock: %w", err)
	}
	return false, nil
}

func isLockHeld(err error) bool {
	return errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN)
}

func signalReady() {
	ready := os.NewFile(uintptr(3), "daemon-ready")
	if ready == nil {
		return
	}
	_, _ = ready.Write([]byte{1})
	_ = ready.Close()
}

func waitForReady(ready *os.File) error {
	if err := ready.SetReadDeadline(time.Now().Add(startTimeout)); err != nil {
		return fmt.Errorf("setting readiness deadline: %w", err)
	}
	var signal [1]byte
	n, err := ready.Read(signal[:])
	if n == 1 {
		return nil
	}
	if err != nil {
		return fmt.Errorf("waiting for daemon readiness: %w", err)
	}
	return errors.New("daemon readiness pipe closed without a signal")
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
