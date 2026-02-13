# Building a DMG on macOS

This guide explains how to copy this project to a Mac and build a macOS DMG installer for **Time-Tracker**.

---

## Prerequisites on Mac

- **macOS** (required — DMG cannot be built from Windows/Linux)
- **Node.js** (v18 or later recommended) — [nodejs.org](https://nodejs.org) or install via Homebrew: `brew install node`
- **npm** (comes with Node.js)
- **Git** (optional, if you clone the repo instead of copying files)

---

## 1. Copy the code to your Mac

Choose one of these methods.

### Option A: Clone the repository (if you use Git)

```bash
git clone https://github.com/supagigs/Supatimetracker.git
cd Supatimetracker
```

### Option B: Copy the project folder

1. Copy the entire **Supatimetracker** folder to your Mac (USB drive, cloud storage, or network share).
2. Open **Terminal** on the Mac.
3. Go to the project folder:
   ```bash
   cd /path/to/Supatimetracker
   ```
   Replace `/path/to/Supatimetracker` with the actual path (e.g. `~/Downloads/Supatimetracker`).

### Option C: Create a zip on Windows, then extract on Mac

1. On Windows: zip the whole project folder (e.g. `Supatimetracker.zip`), excluding `node_modules` to keep the archive small.
2. Transfer the zip to your Mac and double-click to extract.
3. In Terminal:
   ```bash
   cd ~/Downloads/Supatimetracker   # or wherever you extracted it
   ```

---

## 2. Install dependencies

In the project folder, run:

```bash
npm install
```

Wait for it to finish. If you see any optional dependency warnings (e.g. for native modules), you can usually ignore them unless the build fails.

---

## 3. Build the DMG

Run:

```bash
npm run build
```

Or directly:

```bash
npx electron-builder --publish=never
```

- The build may take a few minutes.
- The output is a **universal** DMG (works on both Intel and Apple Silicon Macs).

---

## 4. Find the DMG

After a successful build:

- Open the **`dist`** folder inside the project.
- You should see a file like: **`Time-Tracker-1.0.9-universal.dmg`** (version number may differ).

That file is your macOS installer. You can distribute it or install the app by double-clicking the DMG and dragging the app to **Applications**.

---

## Optional: Code signing (for distribution)

For a smoother experience when others download the app (fewer security warnings):

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) and create a **Developer ID Application** certificate.
2. In the project, create or edit `.env` or your build config and set your certificate identity, e.g. in `package.json` under `build.mac`:
   - Change `"identity": null` to your identity (e.g. `"identity": "Developer ID Application: Your Name (TEAM_ID)"`).
3. Run `npm run build` again. The generated app inside the DMG will be signed.

If you leave `identity` as `null`, the DMG still builds and runs; users may need to right-click the app → **Open** the first time to bypass Gatekeeper.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `npm install` fails | Ensure Node.js is installed: `node -v` and `npm -v`. Try `npm cache clean --force` then `npm install` again. |
| Build fails with permission or entitlement errors | Ensure the `build` folder and `build/entitlements.mac.plist` exist in the project (they are used for macOS entitlements). |
| “Cannot find module” or native build errors | Run `npm install` again; some packages compile native code on first install. |
| DMG not created | Check the end of the build output for errors. Ensure you are on macOS and that `dist` is not read-only. |

---

## Summary

1. Copy or clone the project to your Mac.
2. `cd` into the project folder.
3. Run `npm install`.
4. Run `npm run build`.
5. Get the DMG from the **`dist`** folder.

For questions or issues, refer to the main project README or the [electron-builder documentation](https://www.electron.build/).
