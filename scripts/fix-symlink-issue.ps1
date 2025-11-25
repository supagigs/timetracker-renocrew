# PowerShell script to fix symbolic link issue with electron-builder
# This script should be run as Administrator

Write-Host "=== Electron Builder Symbolic Link Fix ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠ Warning: This script should be run as Administrator" -ForegroundColor Yellow
    Write-Host "  The symbolic link issue requires administrator privileges" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To run as Administrator:" -ForegroundColor Yellow
    Write-Host "  1. Right-click PowerShell" -ForegroundColor Gray
    Write-Host "  2. Select 'Run as Administrator'" -ForegroundColor Gray
    Write-Host "  3. Navigate to the project directory" -ForegroundColor Gray
    Write-Host "  4. Run this script again" -ForegroundColor Gray
    Write-Host ""
    
    $response = Read-Host "Continue anyway? (Y/N)"
    if ($response -ne "Y" -and $response -ne "y") {
        exit
    }
}

# Step 1: Clean electron-builder cache
Write-Host "Step 1: Cleaning electron-builder cache..." -ForegroundColor Yellow
$cachePath = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $cachePath) {
    try {
        Remove-Item -Path $cachePath -Recurse -Force -ErrorAction Stop
        Write-Host "✓ Cache cleaned successfully" -ForegroundColor Green
    } catch {
        Write-Host "✗ Could not clean cache: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  This is normal if files are locked. The build will retry." -ForegroundColor Gray
    }
} else {
    Write-Host "✓ Cache does not exist" -ForegroundColor Green
}

# Step 2: Enable Developer Mode (Windows 10/11) - allows creating symlinks without admin
Write-Host ""
Write-Host "Step 2: Checking Windows Developer Mode..." -ForegroundColor Yellow
try {
    $devMode = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name "AllowDevelopmentWithoutDevLicense" -ErrorAction SilentlyContinue
    
    if ($devMode -and $devMode.AllowDevelopmentWithoutDevLicense -eq 1) {
        Write-Host "✓ Developer Mode is enabled" -ForegroundColor Green
    } else {
        Write-Host "⚠ Developer Mode is not enabled" -ForegroundColor Yellow
        Write-Host "  Enabling Developer Mode allows creating symlinks without admin privileges" -ForegroundColor Gray
        Write-Host ""
        Write-Host "To enable Developer Mode manually:" -ForegroundColor Yellow
        Write-Host "  1. Open Settings > Update & Security > For developers" -ForegroundColor Gray
        Write-Host "  2. Turn on 'Developer Mode'" -ForegroundColor Gray
        Write-Host ""
        
        if ($isAdmin) {
            $response = Read-Host "Enable Developer Mode now? (Y/N)"
            if ($response -eq "Y" -or $response -eq "y") {
                try {
                    Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name "AllowDevelopmentWithoutDevLicense" -Value 1 -Type DWord -ErrorAction Stop
                    Write-Host "✓ Developer Mode enabled" -ForegroundColor Green
                } catch {
                    Write-Host "✗ Could not enable Developer Mode: $($_.Exception.Message)" -ForegroundColor Red
                    Write-Host "  You may need to enable it manually through Settings" -ForegroundColor Gray
                }
            }
        }
    }
} catch {
    Write-Host "⚠ Could not check Developer Mode status" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Solutions ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "If the build still fails with symlink errors, try one of these:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1: Run build as Administrator" -ForegroundColor Green
Write-Host "  Right-click PowerShell > Run as Administrator > npm run build" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 2: Enable Windows Developer Mode" -ForegroundColor Green
Write-Host "  Settings > Update & Security > For developers > Turn on Developer Mode" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 3: Skip code signing entirely (already configured)" -ForegroundColor Green
Write-Host "  The build script already sets CSC_IDENTITY_AUTO_DISCOVERY=false" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 4: Use portable build (no installer)" -ForegroundColor Green
Write-Host "  npm run pack" -ForegroundColor Gray
Write-Host ""




















