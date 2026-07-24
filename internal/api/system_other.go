//go:build !darwin && !linux

package api

// cpuPercent returns 0 on unsupported platforms (best-effort).
func cpuPercent() float64 { return 0 }

// systemMemory returns (0, 0) on unsupported platforms; the handler falls
// back to Go runtime memory stats.
func systemMemory() (total, used uint64) { return 0, 0 }
