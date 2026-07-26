package api

import (
	"bufio"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oh-my-terminal/oh-my-terminal/internal/auth"
	"github.com/oh-my-terminal/oh-my-terminal/internal/config"
	"github.com/oh-my-terminal/oh-my-terminal/internal/store"
)

func TestWebSocketOriginValidation(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	fakeTmux := filepath.Join(t.TempDir(), "tmux")
	if err := os.WriteFile(fakeTmux, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("writing fake tmux: %v", err)
	}
	t.Setenv("PATH", filepath.Dir(fakeTmux))

	ctx := t.Context()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	st, err := store.Load(ctx, logger)
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

	sessions := auth.NewSessionStore(ctx, "password", logger)
	token, err := sessions.Create(ctx)
	if err != nil {
		t.Fatalf("creating session: %v", err)
	}
	server := httptest.NewServer(New(&config.Config{}, st, sessions, logger).Handler())
	defer server.Close()
	defer server.CloseClientConnections()

	address := strings.TrimPrefix(server.URL, "http://")
	path := fmt.Sprintf("/api/workspaces/%s/terminals/tm-test/ws", workspace.ID)
	for _, tc := range []struct {
		name   string
		origin string
		want   int
	}{
		{name: "mismatched origin", origin: "http://attacker.invalid", want: http.StatusForbidden},
		{name: "matching origin", origin: "http://" + address, want: http.StatusSwitchingProtocols},
		{name: "absent origin", want: http.StatusSwitchingProtocols},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status := webSocketHandshakeStatus(t, address, path, tc.origin, token)
			if status != tc.want {
				t.Fatalf("upgrade status = %d, want %d", status, tc.want)
			}
		})
	}
}

func webSocketHandshakeStatus(t *testing.T, address, path, origin, token string) int {
	t.Helper()
	conn, err := net.Dial("tcp", address)
	if err != nil {
		t.Fatalf("dialing WebSocket endpoint: %v", err)
	}
	defer conn.Close()

	var request strings.Builder
	fmt.Fprintf(&request, "GET %s HTTP/1.1\r\n", path)
	fmt.Fprintf(&request, "Host: %s\r\n", address)
	request.WriteString("Connection: Upgrade\r\n")
	request.WriteString("Upgrade: websocket\r\n")
	request.WriteString("Sec-WebSocket-Version: 13\r\n")
	request.WriteString("Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n")
	fmt.Fprintf(&request, "Cookie: %s=%s\r\n", auth.CookieName, token)
	if origin != "" {
		fmt.Fprintf(&request, "Origin: %s\r\n", origin)
	}
	request.WriteString("\r\n")
	if _, err := io.WriteString(conn, request.String()); err != nil {
		t.Fatalf("writing WebSocket handshake: %v", err)
	}

	response, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: http.MethodGet})
	if err != nil {
		t.Fatalf("reading WebSocket handshake: %v", err)
	}
	defer response.Body.Close()
	return response.StatusCode
}
