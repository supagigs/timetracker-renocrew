const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist');

function deleteFolderRecursive(folderPath) {
  if (!fs.existsSync(folderPath)) {
    console.log('dist folder does not exist, skipping cleanup');
    return;
  }

  console.log('Attempting to clean dist folder...');
  
  try {
    // Try to delete the folder
    fs.rmSync(folderPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
    console.log('✓ dist folder cleaned successfully');
  } catch (error) {
    console.warn('⚠ Warning: Could not fully clean dist folder:', error.message);
    console.warn('  This is usually caused by:');
    console.warn('  - The Electron app is still running');
    console.warn('  - Windows Defender or antivirus is scanning the files');
    console.warn('  - File Explorer has the folder open');
    console.warn('');
    console.warn('  Please:');
    console.warn('  1. Close the Electron app if it\'s running');
    console.warn('  2. Close any File Explorer windows in the dist folder');
    console.warn('  3. Wait a few seconds and try again');
    console.warn('  4. If the problem persists, manually delete the dist folder');
    console.warn('');
    // Don't exit with error, let the build continue - electron-builder might handle it
  }
}

deleteFolderRecursive(distPath);







