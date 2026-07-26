package config

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadResolvesRootSymlink(t *testing.T) {
	target := t.TempDir()
	link := filepath.Join(t.TempDir(), "root")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("creating root symlink: %v", err)
	}
	want, err := filepath.EvalSymlinks(target)
	if err != nil {
		t.Fatalf("resolving target directory: %v", err)
	}

	cfg, err := Load(context.Background(), []string{"--password", "x", "--root", link})
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Root != want {
		t.Fatalf("Config.Root = %q, want resolved root %q", cfg.Root, want)
	}
}

func TestLoad(t *testing.T) {
	// Clear config environment variables for deterministic subtests.
	for _, key := range []string{"TH_PASSWORD", "TH_PORT", "TH_HOST", "TH_ROOT", "TH_DAEMON_CHILD"} {
		t.Setenv(key, "")
	}

	ctx := context.Background()

	tests := []struct {
		name        string
		args        []string
		wantErr     string
		daemonChild bool
		check       func(t *testing.T, cfg *Config)
	}{
		{
			name: "stop succeeds without password",
			args: []string{"--stop"},
			check: func(t *testing.T, cfg *Config) {
				if !cfg.Stop {
					t.Errorf("Config.Stop = false, want true")
				}
				if cfg.Status {
					t.Errorf("Config.Status = true, want false")
				}
				if cfg.Daemon {
					t.Errorf("Config.Daemon = true, want false")
				}
			},
		},
		{
			name: "status succeeds without password",
			args: []string{"--status"},
			check: func(t *testing.T, cfg *Config) {
				if !cfg.Status {
					t.Errorf("Config.Status = false, want true")
				}
				if cfg.Stop {
					t.Errorf("Config.Stop = true, want false")
				}
			},
		},
		{
			name:    "no args without password fails",
			args:    []string{},
			wantErr: "--password is required",
		},
		{
			name:    "daemon without password fails",
			args:    []string{"--daemon"},
			wantErr: "--password is required",
		},
		{
			name:    "daemon and stop cannot combine",
			args:    []string{"--daemon", "--stop"},
			wantErr: "cannot be combined",
		},
		{
			name:    "stop and status cannot combine",
			args:    []string{"--stop", "--status"},
			wantErr: "cannot be combined",
		},
		{
			name:        "daemon child environment with password succeeds",
			args:        []string{"--password", "x"},
			daemonChild: true,
			check: func(t *testing.T, cfg *Config) {
				if !cfg.DaemonChild {
					t.Errorf("Config.DaemonChild = false, want true")
				}
				if cfg.Password != "x" {
					t.Errorf("Config.Password = %q, want %q", cfg.Password, "x")
				}
			},
		},
		{
			name: "password and port succeed with absolute root",
			args: []string{"--password", "x", "--port", "18231"},
			check: func(t *testing.T, cfg *Config) {
				if cfg.Port != 18231 {
					t.Errorf("Config.Port = %d, want 18231", cfg.Port)
				}
				if !filepath.IsAbs(cfg.Root) {
					t.Errorf("Config.Root = %q, want absolute path", cfg.Root)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("TH_DAEMON_CHILD", "")
			if tt.daemonChild {
				t.Setenv("TH_DAEMON_CHILD", "1")
			}
			cfg, err := Load(ctx, tt.args)
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("Load() error = nil, want error containing %q", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("Load() error = %q, want error containing %q", err.Error(), tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Load() unexpected error: %v", err)
			}
			if cfg == nil {
				t.Fatal("Load() returned nil Config without error")
			}
			if tt.check != nil {
				tt.check(t, cfg)
			}
		})
	}
}
