# Oh My Terminal

웹 브라우저에서 tmux 기반 터미널을 관리하는 단일 바이너리 웹 앱입니다.

A single-binary web app for managing tmux-based terminals from your browser.

---

## 한국어

### 기능

- **웹 터미널** — xterm.js 기반, WebSocket으로 tmux 세션에 실시간 접속
- **화면 분할** — 가로/세로로 페인을 나눠 여러 세션을 한 화면에 배치 (1024px 이상)
- **워크스페이스** — 프로젝트별로 터미널을 그룹화
- **파일 브라우저** — 파일 탐색, 업로드(드래그&드롭), 다운로드, 인라인 에디터
- **폰트 선택** — 시스템, JetBrains Mono, Fira Code, IBM Plex Mono, Source Code Pro, 나눔고딕코딩
- **다국어** — 한국어 / English
- **모바일 대응** — iOS Safari WebSocket 안정화 (하트비트 + 자동 재연결)
- **레이아웃 영속화** — 분할 레이아웃이 서버에 저장되어 재접속 시 복원

### 설치

[GitHub Releases](https://github.com/DevNewbie1826/oh-my-terminal/releases)에서 최신 바이너리를 받아 설치합니다 (macOS / Linux, amd64 / arm64):

```bash
curl -fsSL https://raw.githubusercontent.com/DevNewbie1826/oh-my-terminal/main/install.sh | sh
```

특정 버전이나 설치 경로는 `VERSION=v0.1.0`, `INSTALL_DIR=~/.local/bin` 환경변수로 지정할 수 있습니다. 런타임에 [tmux](https://github.com/tmux/tmux)가 필요합니다.

### 요구 사항 (소스 빌드)

- [Go](https://go.dev/) 1.26+
- [Node.js](https://nodejs.org/) 18+ (프론트엔드 빌드용)
- [tmux](https://github.com/tmux/tmux) (런타임)

### 빌드

```bash
make build
```

프론트엔드를 빌드하고 Go 단일 바이너리(`bin/oh-my-terminal`)를 생성합니다.

### 실행

```bash
./bin/oh-my-terminal --password <비밀번호> [--port 8080] [--host 0.0.0.0] [--root ~/projects]
```

| 플래그 | 기본값 | 설명 |
|---|---|---|
| `--password` | (필수) | 접속 비밀번호. 환경변수 `TH_PASSWORD`로도 설정 가능 |
| `--port` | `8080` | 리슨 포트. 환경변수 `TH_PORT` |
| `--host` | `0.0.0.0` | 바인드 주소. 환경변수 `TH_HOST` |
| `--root` | `$HOME` | 파일 브라우저 탐색 제한 루트. 환경변수 `TH_ROOT` |

브라우저에서 `http://localhost:8080` 접속 → 비밀번호 입력.

### 데이터

- 워크스페이스/터미널/레이아웃: `~/.terminal-hub/state.json`에 영속화
- tmux 세션: tmux 서버가 관리 (앱 재시작 후에도 세션 생존 시 복원)

---

## English

### Features

- **Web terminal** — xterm.js over WebSocket, real-time tmux session access
- **Split panes** — horizontal/vertical splitting to view multiple sessions at once (1024px+)
- **Workspaces** — group terminals by project
- **File browser** — browse, drag-and-drop upload, download, inline editor
- **Font picker** — System, JetBrains Mono, Fira Code, IBM Plex Mono, Source Code Pro, Nanum Gothic Coding
- **i18n** — Korean / English
- **Mobile support** — iOS Safari WebSocket stability (heartbeat + auto-reconnect)
- **Layout persistence** — split layout saved server-side, restored on reconnect

### Install

Downloads the latest binary from [GitHub Releases](https://github.com/DevNewbie1826/oh-my-terminal/releases) (macOS / Linux, amd64 / arm64):

```bash
curl -fsSL https://raw.githubusercontent.com/DevNewbie1826/oh-my-terminal/main/install.sh | sh
```

Set `VERSION=v0.1.0` or `INSTALL_DIR=~/.local/bin` to override the defaults. [tmux](https://github.com/tmux/tmux) is required at runtime.

### Requirements (build from source)

- [Go](https://go.dev/) 1.26+
- [Node.js](https://nodejs.org/) 18+ (frontend build)
- [tmux](https://github.com/tmux/tmux) (runtime)

### Build

```bash
make build
```

Builds the frontend and produces a single Go binary (`bin/oh-my-terminal`).

### Run

```bash
./bin/oh-my-terminal --password <secret> [--port 8080] [--host 0.0.0.0] [--root ~/projects]
```

| Flag | Default | Description |
|---|---|---|
| `--password` | (required) | Access password. Also via `TH_PASSWORD` env var |
| `--port` | `8080` | Listen port. Also via `TH_PORT` |
| `--host` | `0.0.0.0` | Bind address. Also via `TH_HOST` |
| `--root` | `$HOME` | File browser root restriction. Also via `TH_ROOT` |

Open `http://localhost:8080` in your browser and enter the password.

### Data

- Workspaces/terminals/layout: persisted to `~/.terminal-hub/state.json`
- tmux sessions: managed by the tmux server (survive app restarts if the session is alive)
