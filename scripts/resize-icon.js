const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const iconPath = path.join(__dirname, '..', 'SupagigsLogo.png');
const outputPath = path.join(__dirname, '..', 'SupagigsLogo-256.png');

async function resizeIcon() {
  try {
    if (!fs.existsSync(iconPath)) {
      console.error('Error: SupagigsLogo.png not found');
      process.exit(1);
    }

    // Get current image metadata
    const metadata = await sharp(iconPath).metadata();
    console.log(`Current icon size: ${metadata.width}x${metadata.height} pixels`);

    // Resize to 256x256 (or larger if needed)
    const targetSize = Math.max(256, metadata.width, metadata.height);
    
    await sharp(iconPath)
      .resize(targetSize, targetSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
      })
      .png()
      .toFile(outputPath);

    console.log(`✓ Created resized icon: ${targetSize}x${targetSize} pixels`);
    console.log(`  Saved as: SupagigsLogo-256.png`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the new icon file');
    console.log('  2. If it looks good, replace the original or update package.json');
    console.log('  3. Or rename SupagigsLogo-256.png to SupagigsLogo.png');
  } catch (error) {
    console.error('Error resizing icon:', error.message);
    process.exit(1);
  }
}

resizeIcon();

