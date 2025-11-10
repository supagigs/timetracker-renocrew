# Build Guide

This document explains how to produce production builds of the SupaTimeTracker desktop app and the optional Next.js reports portal. The goal is that a new teammate can install dependencies, configure icons, and ship an installer without hunting through the codebase.

---

## 1. Prerequisites

- **Node.js 18+** (check with `node --version`)
- **npm 9+**
- **Git** (for cloning/updating the repo)
- **Windows 10/11** for the packaged build. macOS/Linux builds are supported but not routinely tested.

> Tip: after installing/upgrading Node, run `npm install -g npm` to ensure the latest CLI features are available.

---

## 2. One-Time Setup

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/supagigs/Supatimetracker.git
   cd Supatimetracker
   npm install
   ```
2. Install front-end dependencies for the web reports portal:
   ```bash
   cd time-tracker-reports
   npm install
   cd ..
   ```
3. Create a `.env` file in the project root (see `ENV_SETUP.md` for the required variables). The build pipeline copies this file into the packaged app so the Supabase credentials work after installation.
4. Supply the Windows icon your release should use. By default the build references `SupagigsLogo.ico` (installer) and `SupagigsLogo.png` (all platforms). Replace these files or update the `build.win.icon`, `build.mac.icon`, and `build.linux.icon` fields in `package.json`.

---

## 3. Building the Electron App

| Command | Description |
| ------- | ----------- |
| `npm run build` | Creates a distributable installer for the current OS (uses `electron-builder`). |
| `npm run dist` | Alias of `npm run build` but explicitly disables auto-publishing. |
| `npm run pack` | Produces an unpacked directory (`dist/win-unpacked`) without an installer. Useful for quick smoke tests. |

1. From the repo root, run:
   ```bash
   npm run build
   ```
2. When the command finishes you will find the outputs under `dist/`:
   - `Time Tracker Setup <version>.exe` – NSIS installer (Windows)
   - `win-unpacked/Time Tracker.exe` – portable binary created during the build
   - macOS / Linux artifacts if you passed `--mac` or `--linux`
3. Share the `.exe` installer with testers or copy the `win-unpacked` folder for portable distribution.

> If you previously ran a build, remove the `dist/` folder first (`Remove-Item dist -Recurse -Force`) to avoid confusion with stale artifacts.

---

## 4. Building the Next.js Reports Portal (Optional)

The Electron app launches the reports portal via `REPORTS_URL`. If you want a production bundle of the web app:

```bash
cd time-tracker-reports
npm run build
npm run start             # serves the production build locally
```

For Vercel, Netlify, or any other hosting platform, deploy the contents of `time-tracker-reports` as you would a standard Next.js 16 app. Remember to configure the same Supabase environment variables (`NEXT_PUBLIC_SUPABASE_URL`, etc.).

---

## 5. Icons & Branding

- **Windows** – Provide a multi-size `.ico` file (16, 24, 32, 48, 64, 128, 256). Update `build.win.icon` if you rename the file. An easy conversion path is to design a 512×512 PNG and convert it using any online tool or `scripts/create-windows-icon.js`.
- **macOS** – Supply an `.icns` file (512×512 or 1024×1024). Update `build.mac.icon` accordingly.
- **Linux** – Use a 512×512 PNG.

Place custom artwork in `build/` or the project root and update `package.json` references so the builder copies the right files.

---

## 6. Environment Variables in Production

During packaging, `.env` is bundled into `resources/`. The app loads it at runtime, so make sure the file exists before running `npm run build`. Required keys:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # recommended for screenshot uploads; falls back to anon key if omitted
SUPABASE_STORAGE_BUCKET=     # optional, defaults to "screenshots"
REPORTS_URL=                 # URL opened when a user clicks "View Reports"
```

For the web portal, replicate the same values with the `NEXT_PUBLIC_` prefix in `time-tracker-reports/.env.local` (see `ENV_SETUP.md`).

---

## 7. Troubleshooting Builds

### Common Fixes

- **`Cannot create symbolic link`** – Enable Windows Developer Mode or run PowerShell as Administrator. See `SYMLINK_FIX.md` and `RUN_AS_ADMIN.md`.
- **File lock errors (`app.asar` in use)** – Close the running app, kill stray `electron`/`Time Tracker` processes, remove `dist/`, and rebuild. `scripts/fix-file-lock.ps1` automates the cleanup.
- **Icon size warnings** – Generate a new icon with the required sizes; no automatic conversion runs during the build.
- **Missing environment variables** – Confirm `.env` exists and rebuild. The packaged app will surface a red banner if Supabase keys are missing.

### Verbose Logging

You can inspect the generated `dist/builder-effective-config.yaml` to see the exact configuration electron-builder used. For additional debugging, pass `DEBUG=electron-builder npm run build`.

---

## 8. Release Checklist

1. Bump the version in `package.json`.
2. Delete old build folders (`dist/`, `dist-new/` if present).
3. Confirm `.env` contains production Supabase keys and the correct `REPORTS_URL`.
4. Run `npm install` to ensure dependencies are resolved.
5. Execute `npm run build`.
6. Smoke-test the installer on a clean machine: login, clock in/out, check screenshot capture, open reports.
7. Zip the installer or share it on your distribution channel.

---

## 9. Need More Help?

- Detailed error scenarios → see `SYMLINK_FIX.md` and `RUN_AS_ADMIN.md`
- Environment configuration → see `ENV_SETUP.md`
- Database migrations → run the scripts in `/database-migration-*.sql` (order documented in `README.md`)

Happy shipping! 🛠️
