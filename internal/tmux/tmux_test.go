package tmux

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestEnableSetClipboard(t *testing.T) {
	dir := t.TempDir()
	argsPath := filepath.Join(dir, "args")
	tmuxPath := filepath.Join(dir, "tmux")
	if err := os.WriteFile(tmuxPath, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$TH_TMUX_ARGS\"\n"), 0o700); err != nil {
		t.Fatalf("writing fake tmux: %v", err)
	}
	t.Setenv("TH_TMUX_ARGS", argsPath)
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	if err := EnableSetClipboard(context.Background()); err != nil {
		t.Fatalf("EnableSetClipboard() error = %v", err)
	}
	got, err := os.ReadFile(argsPath)
	if err != nil {
		t.Fatalf("reading fake tmux args: %v", err)
	}
	const want = "set-option\n-g\nset-clipboard\non\n"
	if string(got) != want {
		t.Fatalf("tmux args = %q, want %q", got, want)
	}
}
