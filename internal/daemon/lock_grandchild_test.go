//go:build darwin || linux

package daemon

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// The daemon child receives the lock fd via ExtraFiles and later spawns tmux.
// If that inherited descriptor lacks close-on-exec, every tmux process keeps
// the lock after the daemon dies: --stop reports not running while --daemon
// reports "already running (starting up)" with no recovery path.
func TestDaemonLockNotInheritedByGrandchild(t *testing.T) {
	if os.Getenv("TH_TEST_DAEMON_GC") == "1" {
		fmt.Fprintf(os.Stdout, "gc-ready %d\n", os.Getpid())
		time.Sleep(5 * time.Minute)
		return
	}
	if os.Getenv("TH_TEST_DAEMON_GC_CHILD") == "1" {
		child, err := prepareChild()
		if err != nil {
			t.Fatalf("helper prepareChild() error = %v", err)
		}
		defer func() { _ = closeChild(child) }()
		gc := exec.Command(os.Args[0], "-test.run=^TestDaemonLockNotInheritedByGrandchild$")
		gc.Env = append(os.Environ(), "TH_TEST_DAEMON_GC=1")
		gc.Stdout = os.Stdout
		if err := gc.Start(); err != nil {
			t.Fatalf("spawning grandchild: %v", err)
		}
		return
	}

	path := filepath.Join(t.TempDir(), lockFileName)
	owner, err := openLockFile(path)
	if err != nil {
		t.Fatalf("openLockFile() error = %v", err)
	}
	if err := syscall.Flock(int(owner.Fd()), syscall.LOCK_EX); err != nil {
		_ = owner.Close()
		t.Fatalf("Flock(LOCK_EX) error = %v", err)
	}
	readyReader, readyWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("creating readiness pipe: %v", err)
	}
	defer func() { _ = readyReader.Close() }()
	defer func() { _ = readyWriter.Close() }()

	cmd := exec.Command(os.Args[0], "-test.run=^TestDaemonLockNotInheritedByGrandchild$")
	cmd.Env = append(os.Environ(), "TH_TEST_DAEMON_GC_CHILD=1", "TH_TEST_DAEMON_LOCK_PATH="+path)
	cmd.ExtraFiles = []*os.File{owner, readyWriter}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatalf("child stdout pipe: %v", err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatalf("starting child: %v", err)
	}

	reader := bufio.NewReader(stdout)
	var line string
	for {
		var err error
		line, err = reader.ReadString('\n')
		if err != nil {
			_ = cmd.Process.Kill()
			t.Fatalf("reading grandchild readiness: %v", err)
		}
		if strings.HasPrefix(line, "gc-ready ") {
			break
		}
	}
	gcPid, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "gc-ready ")))
	if err != nil {
		_ = cmd.Process.Kill()
		t.Fatalf("parsing grandchild pid from %q: %v", line, err)
	}
	defer func() { _, _ = os.FindProcess(gcPid); _ = syscall.Kill(gcPid, syscall.SIGKILL) }()
	if err := cmd.Wait(); err != nil {
		t.Fatalf("child exited with error: %v", err)
	}
	if err := owner.Close(); err != nil {
		t.Fatalf("closing parent lock file: %v", err)
	}

	file, held, err := lockAcquire(path)
	if err != nil {
		t.Fatalf("lockAcquire() after child exit error = %v", err)
	}
	if held {
		t.Fatal("lock still held after daemon child exit: grandchild inherited the lock descriptor")
	}
	if err := file.Close(); err != nil {
		t.Fatalf("closing acquired lock file: %v", err)
	}
}
