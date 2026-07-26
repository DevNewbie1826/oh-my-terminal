// Package auth implements password login, session tokens, and brute-force protection.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

const (
	// CookieName is the session cookie name.
	CookieName = "th_session"
	// SessionTTL is the sliding lifetime of a session token.
	SessionTTL = 24 * time.Hour

	tokenBytes   = 32
	maxFailures  = 10
	banDuration  = time.Hour
	cleanupEvery = 10 * time.Minute
)

type session struct {
	expiresAt time.Time
}

type failureRecord struct {
	count       int
	bannedUntil time.Time
}

// SessionStore issues and validates session tokens, and tracks login failures per IP.
type SessionStore struct {
	passwordHash [sha256.Size]byte
	logger       *slog.Logger

	mu       sync.Mutex
	sessions map[string]session
	failures map[string]*failureRecord
}

// NewSessionStore creates a store for the given access password and starts a
// janitor goroutine that stops when ctx is cancelled.
func NewSessionStore(ctx context.Context, password string, logger *slog.Logger) *SessionStore {
	s := &SessionStore{
		passwordHash: sha256.Sum256([]byte(password)),
		logger:       logger,
		sessions:     make(map[string]session),
		failures:     make(map[string]*failureRecord),
	}
	go s.janitor(ctx)
	return s
}

// Create issues a new random token valid for SessionTTL.
func (s *SessionStore) Create(ctx context.Context) (string, error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generating session token: %w", err)
	}
	token := hex.EncodeToString(raw)
	s.mu.Lock()
	s.sessions[token] = session{expiresAt: time.Now().Add(SessionTTL)}
	s.mu.Unlock()
	return token, nil
}

// Validate reports whether token is live and extends its TTL (sliding expiry).
func (s *SessionStore) Validate(token string) bool {
	if token == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[token]
	if !ok || time.Now().After(sess.expiresAt) {
		delete(s.sessions, token)
		return false
	}
	sess.expiresAt = time.Now().Add(SessionTTL)
	s.sessions[token] = sess
	return true
}

// Revoke invalidates a token.
func (s *SessionStore) Revoke(token string) {
	s.mu.Lock()
	delete(s.sessions, token)
	s.mu.Unlock()
}

// Authenticate atomically checks the ban state and records the result of one
// password attempt. It returns whether the password was accepted and whether
// the IP was already banned.
func (s *SessionStore) Authenticate(ip, candidate string) (authenticated, banned bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	rec := s.failures[ip]
	if rec != nil && now.Before(rec.bannedUntil) {
		return false, true
	}

	got := sha256.Sum256([]byte(candidate))
	if subtle.ConstantTimeCompare(got[:], s.passwordHash[:]) == 1 {
		delete(s.failures, ip)
		return true, false
	}

	if rec == nil {
		rec = &failureRecord{}
		s.failures[ip] = rec
	}
	rec.count++
	if rec.count >= maxFailures {
		rec.bannedUntil = now.Add(banDuration)
		rec.count = 0
		s.logger.Warn("banning ip after repeated login failures", "ip", ip, "ban", banDuration)
	}
	return false, false
}

func (s *SessionStore) janitor(ctx context.Context) {
	ticker := time.NewTicker(cleanupEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.purgeExpired()
		}
	}
}

func (s *SessionStore) purgeExpired() {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for token, sess := range s.sessions {
		if now.After(sess.expiresAt) {
			delete(s.sessions, token)
		}
	}
	for ip, rec := range s.failures {
		if now.After(rec.bannedUntil) {
			delete(s.failures, ip)
		}
	}
}
