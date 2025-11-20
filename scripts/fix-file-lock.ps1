# PowerShell script to fix file lock issues during Electron build
# Usage: .\scripts\fix-file-lock.ps1

Write-Host "=== Electron Build File Lock Fixer ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill any Electron/Node processes
Write-Host "Step 1: Checking for running Electron/Node processes..." -ForegroundColor Yellow
$processes = Get-Process | Where-Object {
    $_.ProcessName -like "*electron*" -or 
    $_.ProcessName -like "*Time Tracker*" -or
    ($_.ProcessName -eq "node" -and $_.Path -like "*Supatimetracker*")
}

if ($processes) {
    Write-Host "Found the following processes:" -ForegroundColor Yellow
    $processes | Format-Table ProcessName, Id, Path -AutoSize
    $response = Read-Host "Do you want to kill these processes? (Y/N)"
    if ($response -eq "Y" -or $response -eq "y") {
        $processes | Stop-Process -Force
        Write-Host "✓ Processes killed" -ForegroundColor Green
        Start-Sleep -Seconds 2
    }
} else {
    Write-Host "✓ No Electron/Node processes found" -ForegroundColor Green
}

# Step 2: Try to delete the dist folder
Write-Host ""
Write-Host "Step 2: Attempting to delete dist folder..." -ForegroundColor Yellow
$distPath = Join-Path $PSScriptRoot "..\dist"
$distPath = Resolve-Path $distPath -ErrorAction SilentlyContinue

if ($distPath -and (Test-Path $distPath)) {
    try {
        # Try normal deletion first
        Remove-Item -Path $distPath -Recurse -Force -ErrorAction Stop
        Write-Host "✓ dist folder deleted successfully" -ForegroundColor Green
    } catch {
        Write-Host "✗ Could not delete dist folder: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Trying alternative methods..." -ForegroundColor Yellow
        
        # Try to delete individual files with retries
        $retries = 3
        $delay = 2
        $success = $false
        
        for ($i = 1; $i -le $retries; $i++) {
            Write-Host "  Attempt $i of $retries..." -ForegroundColor Gray
            Start-Sleep -Seconds $delay
            
            try {
                # Try to unlock and delete using .NET methods
                $files = Get-ChildItem -Path $distPath -Recurse -File -ErrorAction SilentlyContinue
                foreach ($file in $files) {
                    try {
                        $fileStream = [System.IO.File]::Open($file.FullName, 'Open', 'ReadWrite', 'None')
                        $fileStream.Close()
                        Remove-Item -Path $file.FullName -Force -ErrorAction SilentlyContinue
                    } catch {
                        # File is locked, skip it
                    }
                }
                
                # Try to delete directories
                Remove-Item -Path $distPath -Recurse -Force -ErrorAction Stop
                Write-Host "✓ dist folder deleted successfully (attempt $i)" -ForegroundColor Green
                $success = $true
                break
            } catch {
                if ($i -eq $retries) {
                    Write-Host "✗ Failed to delete after $retries attempts" -ForegroundColor Red
                    Write-Host ""
                    Write-Host "Possible solutions:" -ForegroundColor Yellow
                    Write-Host "  1. Restart your computer"
                    Write-Host "  2. Add the project folder to Windows Defender exclusions"
                    Write-Host "  3. Temporarily disable Windows Defender real-time protection"
                    Write-Host "  4. Use Process Explorer to find what's locking the file"
                    Write-Host "  5. Manually delete the dist folder after closing all applications"
                }
            }
        }
    }
} else {
    Write-Host "✓ dist folder does not exist" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "You can now try running: npm run build" -ForegroundColor Green


















