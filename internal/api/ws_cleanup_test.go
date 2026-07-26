package api

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/lxzan/gws"
	"github.com/oh-my-terminal/oh-my-terminal/internal/config"
	"github.com/oh-my-terminal/oh-my-terminal/internal/store"
)

type wsCloseObserver struct {
	gws.BuiltinEventHandler
	closed chan struct{}
}

func (h *wsCloseObserver) OnClose(_ *gws.Conn, _ error) {
	close(h.closed)
}

func TestTerminalExitClosesWebSocketAfterCleanup(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	fakeTmux := filepath.Join(t.TempDir(), "tmux")
	if err := os.WriteFile(fakeTmux, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatalf("writing fake tmux: %v", err)
	}
	t.Setenv("PATH", filepath.Dir(fakeTmux)+string(os.PathListSeparator)+os.Getenv("PATH"))

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	st, err := store.Load(context.Background(), logger)
	if err != nil {
		t.Fatalf("loading store: %v", err)
	}
	workspace, err := st.CreateWorkspace("test", t.TempDir())
	if err != nil {
		t.Fatalf("creating workspace: %v", err)
	}
	if err := st.AddTerminal(workspace.ID, store.Terminal{ID: "tm-test", Name: "test", TmuxSession: "test"}); err != nil {
		t.Fatalf("adding terminal: %v", err)
	}

	api := New(&config.Config{}, st, nil, logger)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.SetPathValue("wsId", workspace.ID)
		r.SetPathValue("tmId", "tm-test")
		api.handleWS(w, r)
	}))
	defer server.Close()
	defer server.CloseClientConnections()

	observer := &wsCloseObserver{closed: make(chan struct{})}
	client, _, err := gws.NewClient(observer, &gws.ClientOption{
		Addr: "ws" + strings.TrimPrefix(server.URL, "http") + "/ws",
	})
	if err != nil {
		t.Fatalf("connecting WebSocket client: %v", err)
	}
	go client.ReadLoop()

	select {
	case <-observer.closed:
	case <-time.After(2 * time.Second):
		t.Fatal("WebSocket remained open after tmux attach exited")
	}
}
