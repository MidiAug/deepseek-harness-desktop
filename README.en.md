# deepseek-harness-desktop

[![Release](https://img.shields.io/github/v/release/MidiAug/deepseek-harness-desktop?include_prereleases&sort=semver)](https://github.com/MidiAug/deepseek-harness-desktop/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4)](https://github.com/MidiAug/deepseek-harness-desktop/releases/latest)

[中文](README.md) · **English**

# DeepSeek Harness Desktop

**Open DeepSeek Harness on Windows — install and go, with the official UI unchanged.**

No need to set up Node yourself. Corporate proxy and China npm mirrors are first-class in Settings.  
Already use the CLI? We prefer your existing `dsh` and the same `~/.dsh` home.

> Community project — **not** an official DeepSeek product. MIT licensed.

<p align="center">
  <img src="docs/images/main-ui.png" alt="Official Harness UI after install" width="900" />
</p>

## Download

**→ [Windows installer](https://github.com/MidiAug/deepseek-harness-desktop/releases/latest)** (`*-setup.exe`)

Windows 10/11 x64. SmartScreen: *More info* → *Run anyway*.  
Guide: [getting started](docs/getting-started.md).

## Why download this one

Other community desktops are great at ecosystems (plugins, multi-OS, sidebars…).  
This repo is built for a different job: **get the environment right, and leave the official UI alone.**

What that means in practice:

1. **China / corporate networks** — npmmirror, system proxy, or custom HTTP/SOCKS in Settings; failed installs can jump to network settings  
2. **You already have the CLI** — if local `dsh` is found, we open the official UI without forcing another copy (you can still choose “prepare inside the app”)  
3. **Same data as the CLI** — default `~/.dsh`; language/theme follow the official settings file  
4. **Clean exit, safe recovery** — reclaim processes we started; try a clean profile without wiping real data; export diagnostics  
5. **No plugin push, no reskin** — you get the official Web UI; optional compact title bar stays out of the way  

<p align="center">
  <img src="docs/images/settings-network.png" alt="Network: mirror & proxy" width="720" />
</p>
<p align="center">
  <img src="docs/images/settings.png" alt="Appearance & window options" width="720" />
</p>

## Which desktop to pick

There’s no single “best” desktop — pick by what you care about:

| You care more about… | Try |
|----------------------|-----|
| Plugin markets, sidebars, Win/Mac/Linux, busy community | [DSH Desktop (anywhere)](https://github.com/anywhere-labs/dsh-desktop), [dsh-tauri-desk](https://github.com/dsh-tauri-desk/deepseek-harness-desktop) |
| **Official UI as-is**, **reuse local `dsh`**, **easy proxy/mirror**, Windows first | **This repo** |
| Terminal is enough | Official [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) CLI |

In one line:

- Want the biggest ecosystem → the two community desktops above  
- Want “official UI in a window, network & local install don’t fight me” → this repo  

<p align="center">
  <img src="docs/images/settings-runtime.png" alt="Local install or app-prepared Harness" width="720" />
  <img src="docs/images/settings-about.png" alt="About & updates" width="720" />
</p>

## Usage

1. Install the setup above  
2. Launch: reuse local Harness if present, otherwise wait for setup  
3. Proxy / mirror: gear → **App settings → Network**

From source (Node 22+, pnpm 9, Rust, WebView2):

```bash
git clone https://github.com/MidiAug/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm tauri dev
```

More: [getting started](docs/getting-started.md) · [configuration](docs/configuration.md) · [troubleshooting](docs/troubleshooting.md) · [releases](docs/releases.md)

## Notes

DeepSeek Harness and dependencies follow their own licenses and trademarks.  
Maintained by [@MidiAug](https://github.com/MidiAug).

[MIT](LICENSE) · [Security](SECURITY.md)
