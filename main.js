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

// Handle thumbnail creation
ipcMain.handle('create-thumbnail', async (event, data) => {
  const { imagePaths, delimiterWidth, outputName } = data;
  console.log('Creating thumbnail with images:', imagePaths);
  
  try {
    if (imagePaths.length !== 3) {
      throw new Error('Exactly 3 images are required for the thumbnail');
    }

    // YouTube thumbnail dimensions
    const THUMBNAIL_WIDTH = 1280;
    const THUMBNAIL_HEIGHT = 720;
    
    // Calculate image width (accounting for delimiters)
    const totalDelimiterWidth = delimiterWidth * 2; // Two delimiters
    const imageWidth = Math.floor((THUMBNAIL_WIDTH - totalDelimiterWidth) / 3);
    
    // Create a blank canvas with white background
    const canvas = sharp({
      create: {
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    });
    
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
    
    // Calculate positions for each image
    const positions = [
      { left: 0, top: 0 },
      { left: imageWidth + delimiterWidth, top: 0 },
      { left: (imageWidth + delimiterWidth) * 2, top: 0 }
    ];
    
    // Create composite operations
    const composites = processedImages.map((buffer, index) => {
      return {
        input: buffer,
        left: positions[index].left,
        top: positions[index].top
      };
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