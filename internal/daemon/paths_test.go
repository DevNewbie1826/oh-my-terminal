package daemon

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestPIDFileRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), pidFileName)
	const pid = 4242
	if err := writePIDFile(path, pid); err != nil {
		t.Fatalf("writePIDFile() error = %v", err)
	}
	got, err := readPIDFile(path)
	if err != nil {
		t.Fatalf("readPIDFile() error = %v", err)
	}
	if got != pid {
		t.Fatalf("readPIDFile() = %d, want %d", got, pid)
	}
}

func TestReadPIDFileMalformedIsNotRunning(t *testing.T) {
	for _, content := range []string{"", "not-a-pid\n", "-1\n"} {
		t.Run(content, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), pidFileName)
			if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
				t.Fatal(err)
			}
			_, err := readPIDFile(path)
			if !errors.Is(err, ErrNotRunning) {
				t.Fatalf("readPIDFile() error = %v, want ErrNotRunning", err)
			}
		})
	}
}

func TestStalePIDIsNotAlive(t *testing.T) {
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	if err := cmd.Start(); err != nil {
		t.Fatalf("starting helper process: %v", err)
	}
	pid := cmd.Process.Pid
	if err := cmd.Wait(); err != nil {
		t.Fatalf("waiting for helper process: %v", err)
	}
	if processAlive(pid) {
		t.Fatalf("processAlive(%d) = true after the process was reaped", pid)
	}
}
