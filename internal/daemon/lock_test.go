//go:build darwin || linux

package daemon

import (
	"path/filepath"
	"syscall"
	"testing"
)

func TestProbeLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), lockFileName)
	owner, err := openLockFile(path)
	if err != nil {
		t.Fatalf("openLockFile() error = %v", err)
	}
	defer func() { _ = owner.Close() }()
	if err := syscall.Flock(int(owner.Fd()), syscall.LOCK_EX); err != nil {
		t.Fatalf("Flock(LOCK_EX) error = %v", err)
	}

	held, err := probeLock(path)
	if err != nil {
		t.Fatalf("probeLock() error = %v", err)
	}
	if !held {
		t.Fatal("probeLock() held = false, want true")
	}
	if err := syscall.Flock(int(owner.Fd()), syscall.LOCK_UN); err != nil {
		t.Fatalf("Flock(LOCK_UN) error = %v", err)
	}

	held, err = probeLock(path)
	if err != nil {
		t.Fatalf("probeLock() after release error = %v", err)
	}
	if held {
		t.Fatal("probeLock() after release held = true, want false")
	}
}
