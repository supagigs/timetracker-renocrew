#!/bin/bash

# Script to manually sign macOS app with entitlements after build
# This is needed when CSC_IDENTITY_AUTO_DISCOVERY=false

APP_PATH="$1"
ENTITLEMENTS_PATH="build/entitlements.mac.plist"

if [ -z "$APP_PATH" ]; then
    echo "Usage: ./scripts/sign-mac-app.sh /path/to/Time\ Tracker.app"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at $APP_PATH"
    exit 1
fi

if [ ! -f "$ENTITLEMENTS_PATH" ]; then
    echo "Error: Entitlements file not found at $ENTITLEMENTS_PATH"
    exit 1
fi

echo "Signing app with entitlements..."
echo "App: $APP_PATH"
echo "Entitlements: $ENTITLEMENTS_PATH"

# Sign with ad-hoc signature (-) and entitlements
codesign --force --deep --sign - \
  --entitlements "$ENTITLEMENTS_PATH" \
  --options runtime \
  "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "✅ App signed successfully!"
    echo ""
    echo "Verifying entitlements..."
    codesign -d --entitlements - "$APP_PATH"
    echo ""
    echo "Verifying Hardened Runtime..."
    codesign -dv "$APP_PATH" | grep runtime
else
    echo "❌ Signing failed!"
    exit 1
fi





