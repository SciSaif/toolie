# Toolie

A fast, local-first desktop utility app — image tools, converters, form presets, dev utilities, and more. Built with **Tauri + Rust + React**.

All processing happens on your machine. No uploads, no internet required.

## Download (Windows & macOS)

**For friends who just want to use the app — no coding required:**

1. Open the [Releases](../../releases) page on GitHub.
2. Download the latest release:
   - **Windows:** `Toolie_*_x64-setup.exe` (or the `.msi` installer)
   - **macOS (Apple Silicon):** file ending in `aarch64.dmg`
   - **macOS (Intel):** file ending in `x64.dmg`
3. Run the installer and open **Toolie** from the Start menu (Windows) or Applications folder (macOS).

### Windows SmartScreen warning

The app is not code-signed yet. Windows may show *"Windows protected your PC"*. This is normal for indie apps:

1. Click **More info**
2. Click **Run anyway**

The app is safe — your friend can also verify the source on GitHub.

## Features (v0.1)

| Tool | Status |
|------|--------|
| Image Resizer & Capper | Available |
| PNG to JPG | Available |
| Photo Layout Studio | Available |
| Form presets (passport, signature, ID) | Coming soon |
| PDF tools | Coming soon |
| Developer tools & converters | Coming soon |

Press **Ctrl+K** (Windows) or **Cmd+K** (macOS) to open the command palette and jump to any tool.

---

## For developers

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/)
- macOS or Windows 10/11

### Run locally

```bash
npm install
npm run tauri dev
```

### Build an installer locally

```bash
npm run tauri build
```

Installers appear in `src-tauri/target/release/bundle/` (`.dmg` on macOS, `.exe`/`.msi` on Windows).

---

## Push to GitHub

If this repo is not on GitHub yet:

```bash
# 1. Create a new empty repo on github.com (no README — you already have one)

# 2. Link and push
git remote add origin https://github.com/YOUR_USERNAME/toolie.git
git push -u origin main
```

Replace `YOUR_USERNAME/toolie` with your actual repo path.

### Publish a release for your friend

Pushing code alone does **not** give your friend a downloadable app. You need a **GitHub Release** with built installers.

**Option A — Automatic (recommended):**

This repo includes a GitHub Actions workflow (`.github/workflows/release.yml`) that builds Windows and macOS installers when you push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

1. Go to **Actions** on GitHub and wait for the workflow to finish (~15–20 min).
2. Go to **Releases** — a draft release will appear with the `.exe`, `.msi`, and `.dmg` files attached.
3. Click **Publish release**.
4. Share the Releases URL with your friend.

**Option B — Build on your Mac and upload manually:**

```bash
npm run tauri build
```

Upload the files from `src-tauri/target/release/bundle/` to a new release on GitHub (**Releases → Draft a new release**).

> **Note:** A Mac can only build macOS installers. To get a Windows `.exe`, use Option A (GitHub builds on a Windows machine) or build on a Windows PC.

---

## Tech stack

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Backend:** Rust (Tauri 2)
- **Platforms:** Windows 10/11 (x64), macOS

## License

Private / not yet licensed.
