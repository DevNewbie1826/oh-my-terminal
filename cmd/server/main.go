package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/oh-my-terminal/oh-my-terminal/internal/api"
	"github.com/oh-my-terminal/oh-my-terminal/internal/config"
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
	if err := api.Run(ctx, cfg, logger); err != nil {
		logger.Error("server exited with error", "err", err)
		os.Exit(1)
	}
}
