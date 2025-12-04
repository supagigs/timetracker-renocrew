#!/bin/bash

# macOS Permission Check Script for Time Tracker
# This script checks Screen Recording and Accessibility permissions
# without requiring Full Disk Access

echo "═══════════════════════════════════════════════════════════"
echo "Time Tracker - macOS Permission Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check Screen Recording permission using tccutil
echo "Checking Screen Recording Permission..."
echo "───────────────────────────────────────────────────────────"

# Try to dump Screen Recording permissions for the bundle ID
BUNDLE_ID="com.supagigs.timetracker"
SCREEN_CAPTURE_RESULT=$(tccutil reset ScreenCapture "$BUNDLE_ID" 2>&1)

# Actually, tccutil reset doesn't show status, it just resets
# Let's use a different approach - check via System Events or list all apps

echo "Checking for Time Tracker in Screen Recording permissions..."
echo ""

# Alternative method: Check if we can query the app's status
# This requires the script to be run with appropriate permissions
# but doesn't require Full Disk Access for Terminal

# Method 1: Use osascript to check System Settings (requires Accessibility permission for Terminal)
echo "Method 1: Checking via System Preferences..."
osascript -e 'tell application "System Events"
    tell process "System Settings"
        try
            -- This would open System Settings to the Screen Recording section
            -- But it's read-only, so we can't easily check status
            set result to "System Settings can be checked manually"
        end try
    end tell
end tell' 2>/dev/null || echo "   → Cannot check via System Events (Terminal may need Accessibility permission)"
echo ""

# Method 2: List all Screen Recording permissions (if possible)
echo "Method 2: Checking available permission check methods..."
echo ""

# Method 3: Use tccutil to check specific bundle
echo "Method 3: Attempting to check permission status..."
echo "   Bundle ID: $BUNDLE_ID"
echo ""

# Check if the app exists in the expected location
APP_PATHS=(
    "/Applications/Time Tracker.app"
    "$HOME/Applications/Time Tracker.app"
)

echo "Checking if app is installed..."
APP_FOUND=false
for APP_PATH in "${APP_PATHS[@]}"; do
    if [ -d "$APP_PATH" ]; then
        echo "   ✓ Found app at: $APP_PATH"
        APP_FOUND=true
        
        # Get bundle ID from Info.plist
        if [ -f "$APP_PATH/Contents/Info.plist" ]; then
            BUNDLE_ID_FROM_APP=$(defaults read "$APP_PATH/Contents/Info.plist" CFBundleIdentifier 2>/dev/null)
            if [ -n "$BUNDLE_ID_FROM_APP" ]; then
                echo "   ✓ Bundle ID from app: $BUNDLE_ID_FROM_APP"
            fi
        fi
        break
    fi
done

if [ "$APP_FOUND" = false ]; then
    echo "   ✗ App not found in standard locations"
    echo "   → If app is installed elsewhere, check manually in System Settings"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "RECOMMENDED: Check Permissions Manually"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "1. Open System Settings"
echo "2. Go to: Privacy & Security → Screen Recording"
echo "3. Look for 'Time Tracker' in the list"
echo "4. Verify the toggle is ON (blue/enabled)"
echo ""
echo "5. Go to: Privacy & Security → Accessibility"
echo "6. Look for 'Time Tracker' in the list"
echo "7. Verify the toggle is ON (blue/enabled)"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Alternative: Use the app's built-in diagnostic tool"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "1. Open the Time Tracker app"
echo "2. Open Developer Tools (View → Toggle Developer Tools)"
echo "3. In Console, run:"
echo "   window.electronAPI.diagnoseScreenCapture().then(console.log);"
echo ""


