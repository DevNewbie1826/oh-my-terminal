package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/oh-my-terminal/oh-my-terminal/internal/api"
	"github.com/oh-my-terminal/oh-my-terminal/internal/config"
	"github.com/oh-my-terminal/oh-my-terminal/internal/daemon"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	cfg, err := config.Load(ctx, os.Args[1:])
	if err != nil {
		logger.Error("configuration error", "err", err)
		os.Exit(1)
	}
	if cfg.Stop {
		pid, err := daemon.Stop()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Printf("oh-my-terminal stopped (pid %d)\n", pid)
		return
	}
	if cfg.Status {
		pid, err := daemon.Status()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Printf("oh-my-terminal is running (pid %d)\n", pid)
		return
	}
	if cfg.Daemon {
		pid, addr, err := daemon.Start(cfg, os.Args[1:])
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Printf("oh-my-terminal started (pid %d, http://%s)\n", pid, addr)
		return
	}
	if cfg.DaemonChild {
		defer func() {
			if err := daemon.RemoveChildPIDFile(); err != nil {
				logger.Warn("removing daemon pid file", "err", err)
			}
		}()
	}
	if err := api.Run(ctx, cfg, logger); err != nil {
		logger.Error("server exited with error", "err", err)
		os.Exit(1)
	}
}
