# Building Time Tracker as .exe File

This guide will help you create a Windows executable (.exe) file from your Electron app.

## Prerequisites

1. **Node.js** installed (version 18 or higher)
2. **electron-builder** (already installed in devDependencies)
3. **All dependencies** installed (`npm install`)

## Step-by-Step Instructions

### Step 1: Install Dependencies

Make sure all dependencies are installed:

```bash
cd "d:\Megha\Electron App\time-tracker-new"
npm install
```

### Step 2: Test the App

Before building, make sure the app runs correctly:

```bash
npm start
```

Verify that:
- The app opens without errors
- All features work correctly
- Environment variables are set up (create `.env` file if needed)

### Step 3: Build the Executable

Run the build command:

```bash
npm run build
```

Or for a distribution build (without publishing):

```bash
npm run dist
```

### Step 4: Find Your .exe File

After building, your executable will be in:

```
dist/
  └── Time Tracker Setup 1.0.0.exe
```

The installer will be in the `dist` folder.

## Build Options

### Build for Current Platform Only

```bash
npm run build
```

### Build for Windows (NSIS Installer)

```bash
npm run dist
```

### Build Without Installer (Portable)

```bash
npm run pack
```

This creates an unpacked version in `dist/win-unpacked/` with `Time Tracker.exe`

## Configuration Details

The build configuration in `package.json` includes:

- **App ID**: `com.yourcompany.time-tracker`
- **Product Name**: `Time Tracker`
- **Output Directory**: `dist`
- **Windows Target**: NSIS installer
- **Files Included**: 
  - `main.js`
  - `preload.js`
  - `renderer/**/*`
  - `node_modules/**/*`

## Important Notes

### Environment Variables

⚠️ **Important**: The `.env` file is NOT included in the build for security reasons.

You have two options:

1. **Hardcode environment variables** in `main.js` (NOT recommended for production)
2. **Use a config file** that gets loaded at runtime
3. **Create a `.env.example`** file and instruct users to create their own `.env`

### Excluding Files from Build

The build automatically excludes:
- Development files
- Source maps (if any)
- `.env` files
- Test files

### File Size

The built executable will be large (typically 100-200MB) because it includes:
- Electron runtime
- Node.js runtime
- All node_modules
- Your application code

## Troubleshooting

### Error: "electron-builder not found"

```bash
npm install electron-builder --save-dev
```

### Error: "Cannot find module"

Make sure all dependencies are installed:
```bash
npm install
```

### Build Fails with Permission Errors

- Run your terminal as Administrator
- Close any running instances of the app
- Delete the `dist` folder and try again

### Build is Too Large

To reduce size, you can:
1. Use `electron-builder` with compression
2. Remove unused dependencies
3. Use `asar` packaging (already enabled by default)

## Advanced Configuration

### Custom Installer Icon

Add to `package.json` build config:

```json
"win": {
  "target": "nsis",
  "icon": "build/icon.ico"
}
```

### Custom Installer Options

You can customize the NSIS installer by adding:

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true
}
```

## Distribution

After building:

1. **Test the installer** on a clean machine (without Node.js installed)
2. **Verify all features work** in the installed version
3. **Check file paths** - ensure all assets load correctly
4. **Test environment variables** - make sure app works without `.env` if needed

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Run app in development
npm start

# Build installer (.exe)
npm run build

# Build portable version
npm run pack

# Build without publishing
npm run dist
```

## Next Steps

1. Build your .exe file using `npm run build`
2. Test the installer on a clean system
3. Distribute the `.exe` file from the `dist` folder



