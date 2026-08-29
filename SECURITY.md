# Security Policy

## Supported versions

Security fixes target the **latest GitHub Release** of deepseek-harness-desktop on the default branch. Older tags are best-effort only.

## What this project is

A **community** Tauri desktop host for the official DeepSeek Harness Web UI. It is **not** an official DeepSeek product. It supervises local Node/`dsh` processes and embeds `http://127.0.0.1` UI; it does **not** patch `@deepseek-ai/*` packages for UI changes.

## Reporting a vulnerability

Please **do not** open a public issue for security-sensitive reports.

1. Email the maintainer listed on the GitHub profile for [MidiAug/deepseek-harness-desktop](https://github.com/MidiAug/deepseek-harness-desktop), **or** use GitHub **Private vulnerability reporting** if enabled on the repository.  
2. Include: affected version/tag, OS, steps to reproduce, impact (e.g. unexpected FS/Shell IPC from the Harness origin, updater bypass, privilege escalation).  
3. Allow reasonable time for a fix or advisory before public disclosure.

## Trust boundaries (intentional)

- Harness page origin: **no** general Tauri filesystem/shell IPC by default.  
- Shell auto-update artifacts are verified with the embedded updater **public** key (`tauri.conf.json`). Private signing material must never be committed.  
- Hosted Node / `@deepseek-ai/dsh` are downloaded from configured mirrors/registries; treat network path and proxy settings as part of your threat model.

## Dependencies

Upstream DeepSeek Harness, Node.js runtimes, and npm packages follow **their own** licenses and security processes. Report issues in those projects to their maintainers when the defect is not in this host.
