/**
 * PSD Mockup Generator - Image Processor
 * 
 * This module processes PSD templates and overlays user designs on them.
 * Supports both PSD.js processing and Puppeteer+Photopea for advanced effects
 * Also supports simpler PNG template processing
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const PSD = require('psd');
const puppeteer = require('puppeteer');
const { downloadDesignImage, cleanupFiles } = require('./downloader');

// Templates directory
const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Get placeholder layer name from environment variables
const DESIGN_PLACEHOLDER_NAME = process.env.DESIGN_PLACEHOLDER_NAME || 'Design';

/**
 * Generate a mockup using PSD.js
 * 
 * @param {string} templatePath - Path to the PSD template
 * @param {string} designImagePath - Path to the design image
 * @param {string} designLayerName - Name of the layer to replace with the design
 * @returns {Promise<string>} - Path to the generated mockup
 */
async function generateMockupWithPsdJs(templatePath, designImagePath, designLayerName = DESIGN_PLACEHOLDER_NAME) {
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
 * Generate a mockup using a PNG template
 * 
 * @param {string} templatePath - Path to the PNG template
 * @param {string} designImagePath - Path to the design image
 * @returns {Promise<string>} - Path to the generated mockup
 */
async function generateMockupWithPngTemplate(templatePath, designImagePath) {
  try {
    console.log(`Loading PNG template: ${templatePath}`);
    
    // Get template metadata
    const templateMetadata = await sharp(templatePath).metadata();
    const { width: templateWidth, height: templateHeight } = templateMetadata;
    
    // Calculate design placement (assuming a centered design with some margins)
    // These values would normally be defined per template, but we'll use defaults
    const designArea = {
      left: 50,
      top: 50,
      width: templateWidth - 100,
      height: templateHeight - 100
    };
    
    // Resize design image to fit the design area
    const designImage = await sharp(designImagePath)
      .resize(designArea.width, designArea.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    
    // Composite the design onto the template
    const outputPath = path.join(TEMP_DIR, `mockup-${Date.now()}.png`);
    
    await sharp(templatePath)
      .composite([
        {
          input: designImage,
          left: designArea.left,
          top: designArea.top
        }
      ])
      .toFile(outputPath);
    
    return outputPath;
  } catch (error) {
    console.error('Error generating mockup with PNG template:', error);
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
async function generateMockupWithPhotopea(templatePath, designImagePath, designLayerName = DESIGN_PLACEHOLDER_NAME) {
  let browser = null;
  
  try {
    console.log('Launching Puppeteer for Photopea mockup generation...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Open Photopea
    await page.goto('https://www.photopea.com', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for Photopea to load
    await page.waitForSelector('#appload', { hidden: true, timeout: 60000 });
    console.log('Photopea loaded successfully');
    
    // Open PSD file
    console.log('Opening PSD template in Photopea...');
    const psdFile = fs.readFileSync(templatePath);
    const psdBase64 = psdFile.toString('base64');
    
    await page.evaluate((psdBase64) => {
      const arr = window.PP.arrayBufferFromBase64(psdBase64);
      window.app.open(arr, null, true);
    }, psdBase64);
    
    // Wait for file to open
    await page.waitForTimeout(3000);
    
    // Find design layer
    console.log(`Finding design layer: ${designLayerName}`);
    const layerExists = await page.evaluate((designLayerName) => {
      const layers = window.app.activeDocument.layers;
      
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
      const arr = window.PP.arrayBufferFromBase64(designBase64);
      window.app.open(arr, null, true);
    }, designBase64);
    
    // Wait for design to open
    await page.waitForTimeout(1000);
    
    // Copy all pixels from design
    await page.evaluate(() => {
      window.app.activeDocument.selection.selectAll();
      window.app.activeDocument.selection.copy();
      window.app.activeDocument.close();
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
      
      const designLayer = findLayer(window.app.activeDocument.layers, designLayerName);
      window.app.activeDocument.activeLayer = designLayer;
      
      // Check if layer has a smart object
      if (designLayer.smartObject) {
        window.app.activeDocument.activeLayer.editSmartObject();
        window.app.activeDocument.selection.selectAll();
        window.app.activeDocument.paste();
        window.app.runMenuItem('Save');
        window.app.runMenuItem('Close');
      } else {
        // Regular layer - paste directly
        window.app.activeDocument.paste();
      }
    }, designLayerName);
    
    // Wait for operations to complete
    await page.waitForTimeout(2000);
    
    // Export as PNG
    console.log('Exporting mockup...');
    const outputBase64 = await page.evaluate(() => {
      return window.app.activeDocument.saveToBase64('png');
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
      console.log('Puppeteer browser closed');
    }
  }
}

/**
 * Generate a basic fallback mockup when no template is available
 * 
 * @param {string} designImagePath - Path to the design image
 * @param {string} text - Text to overlay on the mockup
 * @returns {Promise<string>} - Path to the generated mockup
 */
async function generateBasicMockup(designImagePath, text = 'Mockup') {
  try {
    const outputPath = path.join(TEMP_DIR, `basic-mockup-${Date.now()}.png`);
    
    // Create a simple colored background with the design centered
    const designBuffer = fs.readFileSync(designImagePath);
    const designImage = sharp(designBuffer);
    const metadata = await designImage.metadata();
    
    // Create a larger canvas with a light gray background
    const width = Math.max(metadata.width, 800);
    const height = Math.max(metadata.height, 800);
    
    const canvasWidth = width * 1.5;
    const canvasHeight = height * 1.5;
    
    // Position the design in the center
    const left = Math.floor((canvasWidth - metadata.width) / 2);
    const top = Math.floor((canvasHeight - metadata.height) / 2);
    
    // Create the mockup
    await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 }
      }
    })
    .composite([
      {
        input: designBuffer,
        left,
        top
      }
    ])
    .toFile(outputPath);
    
    return outputPath;
  } catch (error) {
    console.error('Error generating basic mockup:', error);
    throw error;
  }
}

/**
 * Determine template type from file extension
 * 
 * @param {string} templatePath - Path to the template file
 * @returns {string} - Template type ('psd', 'png', 'unknown')
 */
function getTemplateType(templatePath) {
  if (!templatePath) return 'unknown';
  
  const extension = path.extname(templatePath).toLowerCase();
  
  if (extension === '.psd') {
    return 'psd';
  } else if (['.png', '.jpg', '.jpeg'].includes(extension)) {
    return 'png'; // treat all image formats as png for simplicity
  }
  
  return 'unknown';
}

/**
 * Main function to generate a mockup based on parameters
 * 
 * @param {Object} params - Parameters for mockup generation
 * @param {string} params.templatePath - Path to the PSD template
 * @param {string} params.designImagePath - Path to the design image
 * @param {string} params.designId - ID of the design
 * @param {string} params.sku - SKU of the product
 * @param {string} params.mode - Mode of mockup generation ('psdjs', 'photopea', or 'auto')
 * @param {string} params.designLayerName - Name of the design layer in the PSD
 * @returns {Promise<string>} - Path to the generated mockup
 */
async function generateMockup(params) {
  const {
    templatePath,
    designImagePath,
    designId,
    sku,
    mode = 'auto',
    designLayerName = DESIGN_PLACEHOLDER_NAME
  } = params;
  
  try {
    // Check if template exists
    if (templatePath && fs.existsSync(templatePath)) {
      console.log(`Template found: ${templatePath}`);
      
      // Determine template type
      const templateType = getTemplateType(templatePath);
      console.log(`Template type: ${templateType}`);
      
      // If it's a PNG template, use the PNG processor
      if (templateType === 'png') {
        console.log('Using PNG template processor');
        return generateMockupWithPngTemplate(templatePath, designImagePath);
      }
      
      // For PSD templates, choose the processing approach based on mode
      if (templateType === 'psd') {
        if (mode === 'photopea') {
          // Only use Photopea
          console.log(`Using Photopea mode for mockup generation`);
          return generateMockupWithPhotopea(templatePath, designImagePath, designLayerName);
        } else if (mode === 'psdjs') {
          // Only use PSD.js
          console.log(`Using PSD.js mode for mockup generation`);
          return generateMockupWithPsdJs(templatePath, designImagePath, designLayerName);
        } else {
          // Auto mode - try PSD.js first, fall back to Photopea if it fails
          try {
            console.log(`Trying PSD.js first for mockup generation`);
            const mockupPath = await generateMockupWithPsdJs(templatePath, designImagePath, designLayerName);
            return mockupPath;
          } catch (psdError) {
            console.error(`PSD.js approach failed: ${psdError.message}`);
            console.log(`Falling back to Photopea for mockup generation`);
            
            try {
              const mockupPath = await generateMockupWithPhotopea(templatePath, designImagePath, designLayerName);
              return mockupPath;
            } catch (photopeaError) {
              console.error(`Photopea approach also failed: ${photopeaError.message}`);
              console.log(`All PSD processing methods failed, using basic mockup`);
              // If both methods fail, fall back to basic mockup
              return generateBasicMockup(designImagePath, `${sku} mockup`);
            }
          }
        }
      }
      
      // Unknown template type, fall back to basic mockup
      console.log(`Unsupported template type: ${templateType}, using basic mockup`);
      return generateBasicMockup(designImagePath, `${sku} mockup`);
    } else {
      // No template available, generate a basic mockup
      console.log(`No template available for ${sku}, generating basic mockup`);
      return generateBasicMockup(designImagePath, `${sku} mockup`);
    }
  } catch (error) {
    console.error(`Failed to generate mockup: ${error.message}`);
    throw error;
  }
}

module.exports = {
  generateMockup,
  generateMockupWithPsdJs,
  generateMockupWithPhotopea,
  generateMockupWithPngTemplate,
  generateBasicMockup
};
