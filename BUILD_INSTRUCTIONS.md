# Building the Application

This guide explains how to create executable files (.exe for Windows, .dmg for macOS, .AppImage for Linux) from the Electron app.

## Prerequisites

1. **Node.js** (version 16 or higher)
2. **npm** or **yarn**
3. **Windows**: No additional tools needed
4. **macOS**: Xcode Command Line Tools (for code signing)
5. **Linux**: No additional tools needed

## Quick Build (Windows .exe)

### Step 1: Install Dependencies

Make sure all dependencies are installed:

```bash
npm install
```

### Step 2: Build the Executable

Run the build command:

```bash
npm run build
```

Or use the dist command:

```bash
npm run dist
```

### Step 3: Find Your Executable

After building, you'll find the executable in the `dist` folder:

- **Windows**: `dist/Time Tracker Setup x.x.x.exe` (installer) or `dist/win-unpacked/Time Tracker.exe` (portable)
- **macOS**: `dist/Time Tracker-x.x.x.dmg`
- **Linux**: `dist/Time Tracker-x.x.x.AppImage`

## Detailed Build Instructions

### Windows (.exe)

1. **Open Command Prompt or PowerShell** in the project directory

2. **Build the installer**:
   ```bash
   npm run build
   ```

3. **Output location**: 
   - Installer: `dist/Time Tracker Setup x.x.x.exe`
   - Unpacked (portable): `dist/win-unpacked/Time Tracker.exe`

4. **What you get**:
   - **Installer (.exe)**: A setup wizard that installs the app
   - **Unpacked folder**: A portable version that can run without installation

### macOS (.dmg)

1. **Build for macOS**:
   ```bash
   npm run build
   ```

2. **Output**: `dist/Time Tracker-x.x.x.dmg`

3. **Note**: If you want to code sign the app, you'll need:
   - Apple Developer account
   - Code signing certificates
   - Update `package.json` with signing configuration

### Linux (.AppImage)

1. **Build for Linux**:
   ```bash
   npm run build
   ```

2. **Output**: `dist/Time Tracker-x.x.x.AppImage`

3. **Make executable** (if needed):
   ```bash
   chmod +x "dist/Time Tracker-x.x.x.AppImage"
   ```

## Build Options

### Build for Specific Platform

You can build for a specific platform using environment variables:

**Windows:**
```bash
npm run build -- --win
```

**macOS:**
```bash
npm run build -- --mac
```

**Linux:**
```bash
npm run build -- --linux
```

### Build for Multiple Platforms

Build for all platforms:
```bash
npm run build -- --win --mac --linux
```

### Build Only Portable Version (No Installer)

For Windows, you can create just the unpacked version:

```bash
npm run pack
```

This creates `dist/win-unpacked/` with a portable executable.

## Build Configuration

The build configuration is in `package.json` under the `build` section:

```json
{
  "build": {
    "appId": "com.yourcompany.time-tracker",
    "productName": "Time Tracker",
    "win": {
      "target": ["nsis"],
      "icon": "SupagigsLogo.png"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  }
}
```

### Customizing the Build

#### Change App Icon

1. Replace `SupagigsLogo.png` with your icon file
2. **For Windows**: 
   - Use `.ico` format (preferred) or `.png` format
   - **Minimum size: 256x256 pixels** (required by electron-builder)
   - Recommended: 256x256 or 512x512 pixels
   - To resize an existing icon: `node scripts/resize-icon.js`
3. **For macOS**: Use `.icns` format (512x512 recommended)
4. **For Linux**: Use `.png` format (512x512 recommended)

**Icon Size Requirements**:
- Windows: Minimum 256x256 pixels
- macOS: 512x512 pixels (in .icns format)
- Linux: 512x512 pixels (in .png format)

If your icon is too small, use the resize script:
```bash
node scripts/resize-icon.js
```

#### Change Installer Options

Edit the `nsis` section in `package.json`:

```json
"nsis": {
  "oneClick": false,                    // Show installation wizard
  "allowToChangeInstallationDirectory": true,  // Allow custom install path
  "createDesktopShortcut": true,        // Create desktop shortcut
  "createStartMenuShortcut": true,      // Create start menu shortcut
  "shortcutName": "Time Tracker"       // Shortcut name
}
```

#### Change Output Directory

```json
"directories": {
  "output": "dist"  // Change to your preferred output folder
}
```

## Troubleshooting

### Build Fails with "Cannot find module"

**Solution**: Make sure all dependencies are installed:
```bash
npm install
```

### Build is Slow

**Solution**: This is normal for the first build. Subsequent builds are faster due to caching.

### Icon Not Showing / Icon Size Error

**Error Message**: 
```
⨯ image ... must be at least 256x256
```

**Solution**: 
- **Windows**: Requires an `.ico` file with multiple embedded sizes (16, 24, 32, 48, 64, 128, 256 pixels)
- **macOS**: Requires an `.icns` file (512x512 or 1024x1024 recommended)
- **Linux**: Requires a `.png` file (512x512 recommended)

**Automatic Conversion**: 
The build process automatically converts `SupagigsLogo.png` to `SupagigsLogo.ico` for Windows builds. If you need to manually convert:

```bash
npm run convert-icon
```

**Manual Icon Conversion**:
1. **Windows (.ico)**: The `convert-icon-to-ico.js` script automatically creates an ICO file with all required sizes from your PNG
2. **macOS (.icns)**: Use tools like `iconutil` (macOS) or online converters
3. **Linux (.png)**: Use your PNG directly, ensure it's at least 512x512 pixels

**Icon File Requirements**:
- Source PNG should be at least 256x256 pixels (preferably 512x512 or 1024x1024)
- The icon will be automatically resized to all required sizes during conversion
- Ensure your icon design has appropriate padding (don't fill the entire canvas)

### "electron-builder not found" Error

**Solution**: Install electron-builder globally or ensure it's in devDependencies:
```bash
npm install --save-dev electron-builder
```

### Windows Defender or Antivirus Flags the .exe

**Solution**: This is common for unsigned executables. Options:
1. **Code Signing**: Sign the executable with a code signing certificate
2. **Add Exception**: Users can add an exception in their antivirus
3. **Submit for Review**: Submit the app to antivirus vendors for whitelisting

### Build Size is Large

**Solution**: This is normal for Electron apps. The app includes:
- Chromium browser engine
- Node.js runtime
- All dependencies

Typical size: 100-200 MB (unpacked)

### "The process cannot access the file because it is being used by another process" Error

**Error Message**: 
```
⨯ remove D:\...\dist\win-unpacked\resources\app.asar: The process cannot access the file because it is being used by another process.
```

**Solution**: This error occurs when a file in the `dist` folder is locked by another process. Try these solutions in order:

1. **Close the Electron App**:
   - Make sure the Time Tracker app is not running
   - Check Task Manager (Ctrl+Shift+Esc) for any `electron.exe` or `Time Tracker.exe` processes
   - End any related processes

2. **Close File Explorer Windows**:
   - Close any File Explorer windows that are open in the `dist` folder
   - Close any File Explorer windows showing the project directory

3. **Manually Delete the dist Folder**:
   - Close all terminals and applications
   - In File Explorer, navigate to the project directory
   - Delete the entire `dist` folder manually
   - If deletion fails, restart your computer and try again

4. **Use PowerShell to Force Delete** (if manual deletion fails):
   ```powershell
   # Close all Node.js and Electron processes first
   Get-Process | Where-Object {$_.ProcessName -like "*electron*" -or $_.ProcessName -like "*node*"} | Stop-Process -Force
   
   # Wait a few seconds
   Start-Sleep -Seconds 3
   
   # Force delete the dist folder
   Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
   
   # Now try building again
   npm run build
   ```

5. **Check Antivirus Software**:
   - Temporarily disable real-time scanning for the project folder
   - Add the project folder to your antivirus exclusion list
   - Some antivirus software locks files during scanning

6. **Use a Clean Build**:
   ```bash
   # Delete dist folder and node_modules/.cache
   rmdir /s /q dist
   rmdir /s /q node_modules\.cache
   
   # Rebuild
   npm run build
   ```

7. **Run as Administrator** (if needed):
   - Right-click PowerShell or Command Prompt
   - Select "Run as Administrator"
   - Navigate to the project directory and run the build command

**Prevention**: Always close the Electron app and any File Explorer windows in the `dist` folder before running a build.

### "Cannot create symbolic link: A required privilege is not held by the client" Error

**Error Message**:
```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

**Cause**: electron-builder is trying to extract the code signing tool (winCodeSign) which contains macOS files with symbolic links. Windows requires administrator privileges to create symbolic links.

**Solutions** (try in order):

1. **Run PowerShell as Administrator**:
   - Right-click PowerShell
   - Select "Run as Administrator"
   - Navigate to the project directory
   - Run `npm run build`

2. **Enable Windows Developer Mode** (Recommended):
   - Open **Settings** > **Update & Security** > **For developers**
   - Turn on **Developer Mode**
   - This allows creating symlinks without admin privileges
   - Run the fix script: `.\scripts\fix-symlink-issue.ps1`

3. **Clean electron-builder cache**:
   ```powershell
   Remove-Item -Path "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Recurse -Force
   ```

4. **Use portable build** (skips installer, avoids code signing):
   ```bash
   npm run pack
   ```
   This creates `dist/win-unpacked/Time Tracker.exe` without needing code signing tools.

5. **Run the fix script**:
   ```powershell
   .\scripts\fix-symlink-issue.ps1
   ```
   This script will help diagnose and fix the issue.

**Note**: Code signing is already disabled in the build configuration (`CSC_IDENTITY_AUTO_DISCOVERY=false`), but electron-builder may still download the tools. The build will work once the symlink issue is resolved.

**Additional Note**: The app will build successfully without code signing. Users may see a Windows Defender warning when installing unsigned apps, which is normal for unsigned executables.

**Quick Fix Script**: We've included a PowerShell script to help resolve this issue:

```powershell
# Run this script to automatically fix file lock issues
.\scripts\fix-file-lock.ps1
```

This script will:
- Check for and optionally kill any running Electron/Node processes
- Attempt to delete the locked `dist` folder with multiple retry strategies
- Provide detailed error messages and solutions

**Alternative: Use a Different Output Directory** (Temporary Workaround):

If the issue persists, you can temporarily change the output directory in `package.json`:

```json
"directories": {
  "output": "dist-build"
}
```

Then rebuild. This creates a fresh directory without locked files.

## Code Signing (Optional but Recommended)

### Windows Code Signing

1. **Get a Code Signing Certificate**:
   - Purchase from a Certificate Authority (CA)
   - Or use a self-signed certificate (not recommended for distribution)

2. **Configure in package.json**:
   ```json
   "win": {
     "certificateFile": "path/to/certificate.pfx",
     "certificatePassword": "your-password",
     "signingHashAlgorithms": ["sha256"]
   }
   ```

### macOS Code Signing

1. **Get Apple Developer Account**
2. **Configure in package.json**:
   ```json
   "mac": {
     "identity": "Developer ID Application: Your Name",
     "hardenedRuntime": true,
     "gatekeeperAssess": true
   }
   ```

## Distribution

### Distributing the Installer

1. **Test the installer** on a clean machine (without Node.js/development tools)
2. **Upload to your distribution platform**:
   - Your website
   - GitHub Releases
   - Cloud storage (Google Drive, Dropbox, etc.)

### Version Management

Update the version in `package.json` before building:

```json
{
  "version": "1.0.0"  // Update this before each build
}
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run build` | Build installer for current platform |
| `npm run dist` | Same as build (no publishing) |
| `npm run pack` | Build unpacked version (portable) |
| `npm start` | Run in development mode |
| `npm run dev` | Run with DevTools |
| `npm run convert-icon` | Convert PNG icon to ICO format (Windows) |

## File Sizes (Approximate)

- **Windows Installer**: ~80-120 MB
- **Windows Unpacked**: ~150-200 MB
- **macOS DMG**: ~100-150 MB
- **Linux AppImage**: ~100-150 MB

## Next Steps

After building:

1. **Test the installer** on a clean system
2. **Test all features** (login, timer, reports, etc.)
3. **Check file sizes** and optimize if needed
4. **Distribute** to users

---

For more information, see the [electron-builder documentation](https://www.electron.build/).
