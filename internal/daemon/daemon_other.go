//go:build !darwin && !linux

package daemon

import "github.com/oh-my-terminal/oh-my-terminal/internal/config"

func start(_ *config.Config, _ []string) (int, string, error) {
	return 0, "", ErrUnsupported
}

func stop() (int, error) {
	return 0, ErrUnsupported
}

func status() (int, error) {
	return 0, ErrUnsupported
}

func processAlive(_ int) bool { return false }

func prepareChild() (*Child, error) {
	return nil, ErrUnsupported
}

func childReady(_ *Child) error { return ErrUnsupported }

func closeChild(_ *Child) error { return ErrUnsupported }
