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
	Host     string
	Port     int
	Password string
	Root     string
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
	if err := fs.Parse(args); err != nil {
		return nil, err
	}

	if *password == "" {
		return nil, errors.New("--password is required (or set TH_PASSWORD)")
	}
	absRoot, err := filepath.Abs(filepath.Clean(*root))
	if err != nil {
		return nil, fmt.Errorf("resolving root directory: %w", err)
	}
	info, err := os.Stat(absRoot)
	if err != nil {
		return nil, fmt.Errorf("root directory %s: %w", absRoot, err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("root %s is not a directory", absRoot)
	}

	return &Config{Host: *host, Port: *port, Password: *password, Root: absRoot}, nil
}
