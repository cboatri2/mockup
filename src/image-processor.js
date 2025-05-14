/**
 * PSD Mockup Generator - Image Processor
 * 
 * This module processes PSD mockup templates and overlays user designs on them.
 * It provides two approaches:
 * 1. Native PSD.js processing - Using psd.js for basic PSD manipulation
 * 2. Puppeteer with Photopea - For more complex PSDs with advanced layer effects
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const PSD = require('psd');
const puppeteer = require('puppeteer');
const { put } = require('@vercel/blob');
const { downloadDesignImage, cleanupFiles } = require('./downloader');

// Templates directory
const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');
const TEMP_DIR = path.join(__dirname, '..', 'temp');

/**
 * Generate a mockup using PSD.js
 * 
 * @param {string} templatePath - Path to the PSD template
 * @param {string} designImagePath - Path to the design image
 * @param {string} designLayerName - Name of the layer to replace with the design
 * @returns {Promise<string>} - Path to the generated mockup
 */
async function generateMockupWithPsdJs(templatePath, designImagePath, designLayerName = 'Design') {
  try {
    console.log(`Loading PSD template: ${templatePath}`);
    const psd = PSD.fromFile(templatePath);
    psd.parse();

    // Get tree and find design layer
    const tree = psd.tree();
    let designLayer = null;
    
    // Recursive function to find the design layer
    function findDesignLayer(node) {
      if (node.name === designLayerName) {
        return node;
      }
      
      if (node.children) {
        for (const child of node.children) {
          const found = findDesignLayer(child);
          if (found) return found;
        }
      }
      
      return null;
    }
    
    designLayer = findDesignLayer(tree);
    
    if (!designLayer) {
      throw new Error(`Design layer "${designLayerName}" not found in PSD`);
    }
    
    // Get design layer dimensions and coordinates
    const { width, height } = designLayer.get('dimensions');
    const { left, top } = designLayer.get('coords');
    
    // Load the design image and resize it to fit the design layer
    const designImage = await sharp(designImagePath)
      .resize(width, height, { fit: 'fill' })
      .toBuffer();
      
    // Export PSD as PNG
    const psdImage = tree.export();
    
    // Use sharp to overlay the design onto the mockup
    const outputPath = path.join(TEMP_DIR, `mockup-${Date.now()}.png`);
    
    await sharp(psdImage)
      .composite([
        {
          input: designImage,
          left,
          top
        }
      ])
      .toFile(outputPath);
      
    return outputPath;
  } catch (error) {
    console.error('Error generating mockup with PSD.js:', error);
    throw error;
  }
}

/**
 * Generate a mockup using Puppeteer and Photopea (for complex PSDs)
 * 
 * @param {string} templatePath - Path to the PSD template
 * @param {string} designImagePath - Path to the design image
 * @param {string} designLayerName - Name of the layer to replace with the design
 * @returns {Promise<string>} - Path to the generated mockup
 */
async function generateMockupWithPhotopea(templatePath, designImagePath, designLayerName = 'Design') {
  let browser = null;
  
  try {
    console.log('Launching Puppeteer for Photopea mockup generation...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Open Photopea
    await page.goto('https://www.photopea.com', { waitUntil: 'networkidle2' });
    
    // Wait for Photopea to load
    await page.waitForSelector('#appload', { hidden: true, timeout: 60000 });
    
    // Open PSD file
    console.log('Opening PSD template in Photopea...');
    const psdFile = fs.readFileSync(templatePath);
    const psdBase64 = psdFile.toString('base64');
    
    await page.evaluate((psdBase64) => {
      const arr = PP.arrayBufferFromBase64(psdBase64);
      app.open(arr, null, true);
    }, psdBase64);
    
    // Wait for file to open
    await page.waitForTimeout(3000);
    
    // Find design layer
    console.log(`Finding design layer: ${designLayerName}`);
    const layerExists = await page.evaluate((designLayerName) => {
      const layers = app.activeDocument.layers;
      
      function findLayer(layers, name) {
        for (let i = 0; i < layers.length; i++) {
          if (layers[i].name === name) return layers[i];
          if (layers[i].layers) {
            const found = findLayer(layers[i].layers, name);
            if (found) return found;
          }
        }
        return null;
      }
      
      const designLayer = findLayer(layers, designLayerName);
      return !!designLayer;
    }, designLayerName);
    
    if (!layerExists) {
      throw new Error(`Design layer "${designLayerName}" not found in Photopea`);
    }
    
    // Open design image
    console.log('Opening design image...');
    const designFile = fs.readFileSync(designImagePath);
    const designBase64 = designFile.toString('base64');
    
    await page.evaluate((designBase64) => {
      const arr = PP.arrayBufferFromBase64(designBase64);
      app.open(arr, null, true);
    }, designBase64);
    
    // Wait for design to open
    await page.waitForTimeout(1000);
    
    // Copy all pixels from design
    await page.evaluate(() => {
      app.activeDocument.selection.selectAll();
      app.activeDocument.selection.copy();
      app.activeDocument.close();
    });
    
    // Paste into design layer
    console.log('Pasting design into template...');
    await page.evaluate((designLayerName) => {
      function findLayer(layers, name) {
        for (let i = 0; i < layers.length; i++) {
          if (layers[i].name === name) return layers[i];
          if (layers[i].layers) {
            const found = findLayer(layers[i].layers, name);
            if (found) return found;
          }
        }
        return null;
      }
      
      const designLayer = findLayer(app.activeDocument.layers, designLayerName);
      app.activeDocument.activeLayer = designLayer;
      
      // Check if layer has a smart object
      if (designLayer.smartObject) {
        app.activeDocument.activeLayer.editSmartObject();
        app.activeDocument.selection.selectAll();
        app.activeDocument.paste();
        app.runMenuItem('Save');
        app.runMenuItem('Close');
      } else {
        // Regular layer - paste directly
        const bounds = designLayer.bounds;
        app.activeDocument.selection.select([
          [bounds[0], bounds[1]],
          [bounds[2], bounds[1]],
          [bounds[2], bounds[3]],
          [bounds[0], bounds[3]]
        ]);
        app.activeDocument.paste();
      }
    }, designLayerName);
    
    // Wait for operations to complete
    await page.waitForTimeout(2000);
    
    // Export as PNG
    console.log('Exporting mockup...');
    const outputBase64 = await page.evaluate(() => {
      return app.activeDocument.saveToBase64('png');
    });
    
    // Save the PNG
    const outputPath = path.join(TEMP_DIR, `mockup-${Date.now()}.png`);
    fs.writeFileSync(outputPath, Buffer.from(outputBase64, 'base64'));
    
    return outputPath;
  } catch (error) {
    console.error('Error generating mockup with Photopea:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate a product mockup
 * 
 * @param {Object} options - Mockup generation options
 * @param {string} options.designId - The design ID
 * @param {string} options.sku - The product SKU
 * @param {string} options.imageUrl - The design image URL
 * @returns {Promise<string>} - URL to the generated mockup
 */
async function generateMockup({ designId, sku, imageUrl }) {
  console.log(`Generating mockup for design ${designId}, product ${sku}`);
  
  let designImagePath = null;
  let mockupImagePath = null;
  let uploadedUrl = null;
  
  try {
    // Get template file based on SKU
    const templatePath = path.join(TEMPLATES_DIR, `${sku}.psd`);
    
    // Check if template exists, if not use a default
    const templateExists = fs.existsSync(templatePath);
    const finalTemplatePath = templateExists ? 
      templatePath : 
      path.join(TEMPLATES_DIR, 'default.psd');
    
    // Download design image
    designImagePath = await downloadDesignImage(imageUrl, designId);
    console.log(`Design image downloaded to ${designImagePath}`);
    
    // Try to generate with PSD.js first
    try {
      mockupImagePath = await generateMockupWithPsdJs(finalTemplatePath, designImagePath);
    } catch (psdJsError) {
      console.warn('PSD.js processing failed, falling back to Photopea:', psdJsError.message);
      mockupImagePath = await generateMockupWithPhotopea(finalTemplatePath, designImagePath);
    }
    
    console.log(`Mockup generated at ${mockupImagePath}`);
    
    // Upload to Vercel Blob
    const mockupFile = fs.readFileSync(mockupImagePath);
    const blobName = `mockups/${sku}/${designId}-${Date.now()}.png`;
    
    console.log(`Uploading mockup to blob storage: ${blobName}`);
    const blob = await put(blobName, mockupFile, {
      access: 'public',
      contentType: 'image/png'
    });
    
    uploadedUrl = blob.url;
    console.log(`Mockup uploaded to ${uploadedUrl}`);
    
    return uploadedUrl;
  } catch (error) {
    console.error('Error generating mockup:', error);
    throw error;
  } finally {
    // Clean up temporary files
    const filesToCleanup = [designImagePath, mockupImagePath].filter(Boolean);
    cleanupFiles(filesToCleanup);
  }
}

module.exports = {
  generateMockup
};
