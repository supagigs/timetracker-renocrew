const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Convert the 512x512 PNG to a proper ICO file for Windows
// Note: sharp doesn't directly support ICO, but electron-builder can use PNG
// However, for best compatibility, we'll create a 256x256 PNG that electron-builder can use

const pngPath = path.join(__dirname, '..', 'assets', 'android-chrome-512x512.png');
const outputIcoPath = path.join(__dirname, '..', 'icon.ico');
const outputPng256Path = path.join(__dirname, '..', 'icon-256.png');

async function createWindowsIcon() {
  try {
    if (!fs.existsSync(pngPath)) {
      console.error('Error: android-chrome-512x512.png not found');
      process.exit(1);
    }

    console.log('Creating Windows icon from android-chrome-512x512.png...');
    
    // Create a 256x256 PNG version (electron-builder can use PNG for Windows)
    await sharp(pngPath)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(outputPng256Path);

    console.log('✓ Created icon-256.png (256x256)');
    console.log('');
    console.log('Note: electron-builder accepts PNG files for Windows icons.');
    console.log('Update package.json to use "icon-256.png" or keep using PNG.');
    console.log('');
    console.log('For a true .ico file, you can:');
    console.log('  1. Use an online converter: convertio.co, icoconvert.com');
    console.log('  2. Use ImageMagick: magick convert icon-256.png -define icon:auto-resize icon.ico');
    console.log('  3. Use a tool like IcoFX or Greenfish Icon Editor');
  } catch (error) {
    console.error('Error creating icon:', error.message);
    process.exit(1);
  }
}

createWindowsIcon();

