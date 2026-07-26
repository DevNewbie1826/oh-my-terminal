// Package config loads runtime configuration from CLI flags and environment.
package config

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// Config holds all runtime settings for the server.
type Config struct {
	Host        string
	Port        int
	Password    string
	Root        string
	Daemon      bool
	Stop        bool
	Status      bool
	DaemonChild bool
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envPort(fallback int) int {
	if v := os.Getenv("TH_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// Load parses CLI flags (with environment fallbacks) and validates the result.
func Load(ctx context.Context, args []string) (*Config, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolving home directory: %w", err)
	}

	fs := flag.NewFlagSet("oh-my-terminal", flag.ContinueOnError)
	host := fs.String("host", envOr("TH_HOST", "0.0.0.0"), "listen address")
	port := fs.Int("port", envPort(8080), "listen port")
	password := fs.String("password", envOr("TH_PASSWORD", ""), "access password (required)")
	root := fs.String("root", envOr("TH_ROOT", home), "root directory for file browsing")
	daemon := fs.Bool("daemon", false, "run in the background")
	stop := fs.Bool("stop", false, "stop the background server")
	status := fs.Bool("status", false, "show background server status")
	daemonChild := os.Getenv("TH_DAEMON_CHILD") == "1"
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	if (*daemon && (*stop || *status)) || (*stop && *status) {
		return nil, errors.New("--daemon, --stop, and --status cannot be combined")
	}
	if daemonChild && (*stop || *status) {
		return nil, errors.New("TH_DAEMON_CHILD cannot be combined with --stop or --status")
	}

	serving := !*stop && !*status
	if serving && *password == "" {
		return nil, errors.New("--password is required (or set TH_PASSWORD)")
	}

	cfg := &Config{
		Host:        *host,
		Port:        *port,
		Password:    *password,
		Root:        *root,
		Daemon:      *daemon,
		Stop:        *stop,
		Status:      *status,
		DaemonChild: daemonChild,
	}
	if !serving {
		return cfg, nil
	}
	absRoot, err := filepath.Abs(filepath.Clean(*root))
	if err != nil {
		return nil, fmt.Errorf("resolving root directory: %w", err)
	}
	resolvedRoot, err := filepath.EvalSymlinks(absRoot)
	if err != nil {
		return nil, fmt.Errorf("resolving root directory symlinks: %w", err)
	}
	info, err := os.Stat(resolvedRoot)
	if err != nil {
		return nil, fmt.Errorf("root directory %s: %w", resolvedRoot, err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("root %s is not a directory", resolvedRoot)
	}
	cfg.Root = resolvedRoot
	return cfg, nil
}
