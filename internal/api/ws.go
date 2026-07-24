package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"unicode/utf8"

	"github.com/creack/pty"
	"github.com/lxzan/gws"
	"github.com/oh-my-terminal/oh-my-terminal/internal/tmux"
)

const (
	sessionKeyPTY  = "pty"
	sessionKeyCmd  = "cmd"
	sessionKeyTmux = "tmuxSession"

	ptyReadSize = 32 * 1024
	defaultCols = 80
	defaultRows = 24
)

// WebSocket wire message types.
const (
	msgPing   = "ping"
	msgPong   = "pong"
	msgInput  = "input"
	msgResize = "resize"
	msgOutput = "output"
)

// pongFrame is the precomputed reply to a client keepalive ping.
var pongFrame = []byte(`{"type":"pong"}`)

type wsIncoming struct {
	Type string `json:"type"`
	Data string `json:"data"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

type wsOutput struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	terminal, err := s.store.GetTerminal(r.PathValue("wsId"), r.PathValue("tmId"))
	if err != nil {
		s.writeStoreError(w, err)
		return
	}
	socket, err := s.upgrader.Upgrade(w, r)
	if err != nil {
		s.logger.Warn("websocket upgrade failed", "err", err)
		return
	}
	socket.Session().Store(sessionKeyTmux, terminal.TmuxSession)
	go socket.ReadLoop()
}

// OnOpen starts "tmux attach" in a PTY and bridges its output to the socket.
func (s *Server) OnOpen(socket *gws.Conn) {
	val, ok := socket.Session().Load(sessionKeyTmux)
	if !ok {
		_ = socket.WriteClose(1011, []byte("missing session"))
		return
	}
	name, ok := val.(string)
	if !ok || name == "" {
		_ = socket.WriteClose(1011, []byte("invalid session"))
		return
	}
	// Enable mouse support so wheel/touch drags scroll the tmux scrollback
	// (copy-mode) instead of being converted to arrow keys tmux ignores.
	// Best-effort: attach proceeds even if this fails.
	if err := tmux.EnableMouse(context.Background()); err != nil {
		s.logger.Warn("enabling tmux mouse mode", "err", err)
	}
	cmd := exec.Command("tmux", "attach", "-t", name)
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: defaultRows, Cols: defaultCols})
	if err != nil {
		s.logger.Error("starting pty", "session", name, "err", err)
		_ = socket.WriteClose(1011, []byte("failed to start pty"))
		return
	}
	socket.Session().Store(sessionKeyPTY, ptmx)
	socket.Session().Store(sessionKeyCmd, cmd)
	go s.pipePTYToSocket(socket, ptmx)
}

// pipePTYToSocket forwards PTY output as {"type":"output"} frames, splitting at
// UTF-8 boundaries so multi-byte sequences are never cut mid-character.
func (s *Server) pipePTYToSocket(socket *gws.Conn, ptmx *os.File) {
	buf := make([]byte, ptyReadSize)
	pending := []byte{}
	for {
		n, err := ptmx.Read(buf)
		if n > 0 {
			pending = append(pending, buf[:n]...)
			if len(pending) > ptyReadSize*2 {
				pending = pending[len(pending)-3:] // keep at most 3 trailing bytes
			}
			valid := validUTF8Prefix(pending)
			if valid > 0 {
				frame, _ := json.Marshal(wsOutput{Type: msgOutput, Data: string(pending[:valid])})
				if werr := socket.WriteMessage(gws.OpcodeText, frame); werr != nil {
					return
				}
				rest := make([]byte, len(pending)-valid)
				copy(rest, pending[valid:])
				pending = rest
			}
		}
		if err != nil {
			return
		}
	}
}

// validUTF8Prefix returns the length of the longest valid UTF-8 prefix,
// holding back at most 3 trailing bytes of an incomplete sequence.
func validUTF8Prefix(b []byte) int {
	if utf8.Valid(b) {
		return len(b)
	}
	for i := len(b) - 1; i >= 0 && i >= len(b)-3; i-- {
		if utf8.Valid(b[:i]) {
			return i
		}
	}
	return 0
}

// OnMessage routes client frames: ping → pong, input → PTY stdin,
// resize → pty.Setsize.
func (s *Server) OnMessage(socket *gws.Conn, message *gws.Message) {
	defer message.Close()
	var msg wsIncoming
	if err := json.Unmarshal(message.Bytes(), &msg); err != nil {
		return
	}
	// Application-level keepalive for mobile clients (iOS suspends sockets
	// without closing them); answer before touching the PTY.
	if msg.Type == msgPing {
		_ = socket.WriteMessage(gws.OpcodeText, pongFrame)
		return
	}
	val, ok := socket.Session().Load(sessionKeyPTY)
	if !ok {
		return
	}
	ptmx, ok := val.(*os.File)
	if !ok {
		return
	}
	switch msg.Type {
	case msgInput:
		_, _ = ptmx.Write([]byte(msg.Data))
	case msgResize:
		if msg.Cols > 0 && msg.Rows > 0 {
			_ = pty.Setsize(ptmx, &pty.Winsize{Rows: msg.Rows, Cols: msg.Cols})
		}
	}
}

// OnClose tears down the PTY; the tmux session itself survives.
func (s *Server) OnClose(socket *gws.Conn, err error) {
	if err != nil {
		s.logger.Debug("websocket closed", "err", err)
	}
	if val, ok := socket.Session().Load(sessionKeyPTY); ok {
		if f, ok := val.(*os.File); ok {
			_ = f.Close()
		}
	}
	if val, ok := socket.Session().Load(sessionKeyCmd); ok {
		if cmd, ok := val.(*exec.Cmd); ok && cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	}
}
