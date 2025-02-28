const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    title: 'YouTube Thumbnail Combiner'
  });
  
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// Handle image selection
ipcMain.handle('select-images', async () => {
  console.log('Selecting images...');
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    
    console.log('Dialog result:', result);
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths;
    }
    return [];
  } catch (error) {
    console.error('Error in select-images:', error);
    throw error;
  }
});

// Helper function to parse color
function parseColor(hexColor) {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Parse hex to RGB
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
    alpha: 1
  };
}

// Handle thumbnail creation
ipcMain.handle('create-thumbnail', async (event, data) => {
  const { 
    imagePaths, 
    delimiterWidth, 
    tiltAngle,
    dividerColor,
    shadowEnabled,
    shadowBlur,
    shadowOpacity,
    outputName 
  } = data;
  
  console.log('Creating thumbnail with images:', imagePaths);
  console.log('Options:', { delimiterWidth, tiltAngle, dividerColor, shadowEnabled });
  
  try {
    if (imagePaths.length !== 3) {
      throw new Error('Exactly 3 images are required for the thumbnail');
    }
    
    // Parse divider color
    const colorObj = parseColor(dividerColor);
    
    // YouTube thumbnail dimensions
    const THUMBNAIL_WIDTH = 1280;
    const THUMBNAIL_HEIGHT = 720;
    
    // Calculate image width (accounting for delimiters)
    const totalDelimiterWidth = delimiterWidth * 2; // Two delimiters
    const imageWidth = Math.floor((THUMBNAIL_WIDTH - totalDelimiterWidth) / 3);
    
    // Process images - resize each one to fit in the thumbnail
    const processedImages = await Promise.all(
      imagePaths.map(async (imagePath) => {
        return await sharp(imagePath)
          .resize({
            width: imageWidth,
            height: THUMBNAIL_HEIGHT,
            fit: 'cover',
            position: 'center'
          })
          .toBuffer();
      })
    );
    
    // Create a blank canvas with transparent background (we'll set background later)
    const canvas = sharp({
      create: {
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });
    
    // Calculate positions for each image with tilted dividers
    // When dividers are tilted, we need to adjust image positions
    const tiltRadians = (tiltAngle * Math.PI) / 180;
    const tiltOffset = Math.abs(Math.tan(tiltRadians) * THUMBNAIL_HEIGHT);
    
    // Adjust for the tilt direction
    const leftOffset = tiltAngle > 0 ? 0 : tiltOffset;
    
    // Calculate image positions
    const positions = [
      { left: 0, top: 0 },
      { left: imageWidth + delimiterWidth, top: 0 },
      { left: (imageWidth + delimiterWidth) * 2, top: 0 }
    ];
    
    // Create divider SVGs
    const dividerSvgs = [];
    
    for (let i = 0; i < 2; i++) {
      const dividerX = (i + 1) * imageWidth + i * delimiterWidth;
      
      // Create SVG for the divider
      let dividerSvg = `
        <svg width="${delimiterWidth + tiltOffset}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            ${shadowEnabled ? `
              <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="${shadowBlur}"/>
                <feComponentTransfer>
                  <feFuncA type="linear" slope="${shadowOpacity}"/>
                </feComponentTransfer>
                <feOffset dx="0" dy="0" result="offsetblur"/>
                <feBlend in="SourceGraphic" in2="offsetblur" mode="normal"/>
              </filter>
            ` : ''}
          </defs>
          <polygon 
            points="${leftOffset},0 ${delimiterWidth + (tiltAngle < 0 ? tiltOffset : 0)},0 ${delimiterWidth + (tiltAngle > 0 ? tiltOffset : 0)},${THUMBNAIL_HEIGHT} ${tiltAngle > 0 ? 0 : tiltOffset},${THUMBNAIL_HEIGHT}"
            fill="rgb(${colorObj.r},${colorObj.g},${colorObj.b})"
            ${shadowEnabled ? 'filter="url(#shadow)"' : ''}
          />
        </svg>
      `;
      
      // Convert SVG to Buffer
      const dividerBuffer = Buffer.from(dividerSvg);
      dividerSvgs.push(dividerBuffer);
    }
    
    // Composite operations
    const composites = [];
    
    // Add image 1
    composites.push({
      input: processedImages[0],
      left: positions[0].left,
      top: positions[0].top
    });
    
    // Add first divider
    composites.push({
      input: dividerSvgs[0],
      left: imageWidth,
      top: 0
    });
    
    // Add image 2
    composites.push({
      input: processedImages[1],
      left: positions[1].left,
      top: positions[1].top
    });
    
    // Add second divider
    composites.push({
      input: dividerSvgs[1],
      left: imageWidth * 2 + delimiterWidth,
      top: 0
    });
    
    // Add image 3
    composites.push({
      input: processedImages[2],
      left: positions[2].left,
      top: positions[2].top
    });
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(app.getPath('pictures'), 'YouTube-Thumbnails');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate output filename with date if none provided
    const outputFilename = outputName ||
      `youtube-thumbnail-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}`;
    const outputPath = path.join(outputDir, `${outputFilename}.png`);
    
    // Create the composite image
    await canvas
      .composite(composites)
      .png()
      .toFile(outputPath);
    
    console.log('Thumbnail created successfully:', outputPath);
    return {
      success: true,
      outputPath,
      outputDir
    };
  } catch (error) {
    console.error('Error creating thumbnail:', error);
    return {
      success: false,
      error: error.message
    };
  }
});