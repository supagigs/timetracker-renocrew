const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Note: This script creates a PNG file. For a true .ico file, you'll need additional tools.
// However, electron-builder can use PNG files for Windows icons if they're the right size.

const iconPath = path.join(__dirname, '..', 'assets', 'SupagigsIcon.ico');
const outputPath = path.join(__dirname, '..', 'assets', 'SupagigsIcon.ico');

async function createWindowsIcon() {
  try {
    if (!fs.existsSync(iconPath)) {
      console.error('Error: SupagigsIcon.ico not found');
      process.exit(1);
    }

    // Create multiple sizes for .ico (though we'll save as PNG since sharp doesn't support .ico directly)
    // electron-builder will handle the conversion
    const sizes = [16, 32, 48, 64, 128, 256];
    
    console.log('Creating Windows icon sizes...');
    
    // For now, create a 256x256 version which electron-builder can use
    // Note: True .ico files require special tools. electron-builder accepts PNG for Windows.
    await sharp(iconPath)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(outputPath.replace('.ico', '-256.png'));

    console.log('✓ Created icon-256.png (256x256)');
    console.log('');
    console.log('Note: electron-builder accepts PNG files for Windows icons.');
    console.log('The current SupagigsIcon.ico (256x256) should work fine.');
    console.log('');
    console.log('For a true .ico file with multiple sizes, you can:');
    console.log('  1. Use an online converter (e.g., convertio.co, icoconvert.com)');
    console.log('  2. Use ImageMagick: magick convert SupagigsIcon.ico -define icon:auto-resize SupagigsIcon.ico');
    console.log('  3. Use a tool like IcoFX or Greenfish Icon Editor');
  } catch (error) {
    console.error('Error creating icon:', error.message);
    process.exit(1);
  }
}

createWindowsIcon();

