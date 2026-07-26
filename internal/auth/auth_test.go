package auth

import (
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

func TestAuthenticateConcurrentFailuresBanAtThreshold(t *testing.T) {
	store := NewSessionStore(t.Context(), "correct-password", slog.New(slog.NewTextHandler(io.Discard, nil)))

	const attempts = maxFailures * 3
	start := make(chan struct{})
	results := make(chan struct {
		authenticated bool
		banned        bool
	}, attempts)
	var wg sync.WaitGroup
	for range attempts {
		wg.Go(func() {
			<-start
			authenticated, banned := store.Authenticate("192.0.2.1", "wrong-password")
			results <- struct {
				authenticated bool
				banned        bool
			}{authenticated, banned}
		})
	}

	close(start)
	wg.Wait()
	close(results)

	var admitted, rejected int
	for result := range results {
		if result.authenticated {
			t.Error("incorrect password was authenticated")
		}
		if result.banned {
			rejected++
		} else {
			admitted++
		}
	}
	if admitted != maxFailures {
		t.Fatalf("failed attempts admitted = %d, want %d", admitted, maxFailures)
	}
	if rejected != attempts-maxFailures {
		t.Fatalf("failed attempts rejected as banned = %d, want %d", rejected, attempts-maxFailures)
	}

	store.mu.Lock()
	record := store.failures["192.0.2.1"]
	store.mu.Unlock()
	if record == nil || !time.Now().Before(record.bannedUntil) {
		t.Fatal("IP was not banned after reaching the failure threshold")
	}
	if record.count != 0 {
		t.Fatalf("failure counter = %d after ban, want 0", record.count)
	}
}
