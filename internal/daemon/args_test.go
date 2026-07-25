//go:build darwin || linux

package daemon

import (
	"reflect"
	"testing"
)

// TestDaemonChildArgs pins the args rewrite performed when re-execing the
// server as a daemon child: the user-facing --daemon flag is translated to
// the internal --daemon-child flag while all other args are preserved.
func TestDaemonChildArgs(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want []string
	}{
		{
			name: "daemon flag rewritten to daemon-child",
			args: []string{"--daemon", "--password", "x"},
			want: []string{"--daemon-child", "--password", "x"},
		},
		{
			name: "daemon equals form rewritten",
			args: []string{"--daemon=true"},
			want: []string{"--daemon-child=true"},
		},
		{
			name: "non-daemon args unchanged",
			args: []string{"--password", "x"},
			want: []string{"--password", "x"},
		},
		{
			name: "empty slice stays empty",
			args: []string{},
			want: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := daemonChildArgs(tt.args)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("daemonChildArgs(%v) = %v, want %v", tt.args, got, tt.want)
			}
		})
	}
}
