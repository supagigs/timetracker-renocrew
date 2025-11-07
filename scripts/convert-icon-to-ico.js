const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const inputPath = path.join(__dirname, '..', 'SupagigsLogo.png');
const outputPath = path.join(__dirname, '..', 'SupagigsLogo.ico');

// Required sizes for Windows ICO files
const sizes = [16, 24, 32, 48, 64, 128, 256];

async function convertPngToIco() {
  try {
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Check if ICO file already exists and is newer than PNG
    if (fs.existsSync(outputPath)) {
      const pngStats = fs.statSync(inputPath);
      const icoStats = fs.statSync(outputPath);
      
      // If ICO is newer than PNG, skip conversion
      if (icoStats.mtime >= pngStats.mtime) {
        console.log('✓ ICO file is up to date, skipping conversion');
        return;
      }
    }

    console.log('Converting PNG to ICO format...');
    console.log(`Input: ${inputPath}`);
    console.log(`Output: ${outputPath}`);

    // Get original image info
    const metadata = await sharp(inputPath).metadata();
    console.log(`Original image: ${metadata.width}x${metadata.height} pixels`);

    // Resize to all required sizes and convert to buffers
    const buffers = await Promise.all(
      sizes.map(async (size) => {
        const buffer = await sharp(inputPath)
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toBuffer();
        console.log(`  ✓ Generated ${size}x${size} icon`);
        return buffer;
      })
    );

    // Convert buffers to ICO format
    console.log('Creating ICO file with multiple sizes...');
    const ico = await toIco(buffers);
    
    // Write ICO file
    fs.writeFileSync(outputPath, ico);
    console.log(`✓ Successfully created: ${outputPath}`);
    console.log(`  ICO file contains ${sizes.length} sizes: ${sizes.join(', ')}px`);
    
  } catch (error) {
    console.error('Error converting icon:', error.message);
    process.exit(1);
  }
}

convertPngToIco();

