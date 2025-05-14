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
  
  // Helper function for delays (instead of page.waitFor/waitForTimeout)
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    console.log('Launching Puppeteer for Photopea mockup generation...');
    
    // Check for Chrome path in environment variables
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
    console.log(`Chrome path from env: ${chromePath}`);
    
    // Define possible Chrome paths for the Puppeteer Docker image
    const possiblePaths = [
      chromePath,
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ].filter(Boolean); // Remove undefined/null entries
    
    // Try to find the first existing Chrome executable
    let executablePath;
    for (const path of possiblePaths) {
      try {
        if (fs.existsSync(path)) {
          console.log(`Found Chrome executable at: ${path}`);
          executablePath = path;
          break;
        } else {
          console.log(`Chrome not found at: ${path}`);
        }
      } catch (err) {
        console.log(`Error checking path ${path}: ${err.message}`);
      }
    }
    
    // Configure Puppeteer launch options
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    };
    
    // Only set executablePath if found and not running in the Puppeteer Docker image
    if (executablePath && !process.env.PUPPETEER_SKIP_DOWNLOAD) {
      launchOptions.executablePath = executablePath;
    }
    
    console.log('Launching browser with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    
    console.log('Puppeteer launched successfully');
    
    const page = await browser.newPage();
    
    // Set viewport to ensure consistent rendering
    await page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });
    
    // Monitor console logs and errors
    page.on('console', msg => console.log(`Browser console [${msg.type()}]: ${msg.text()}`));
    page.on('pageerror', err => console.error('Browser page error:', err.message));
    
    // Open Photopea with a more generous timeout
    console.log('Opening Photopea website...');
    try {
      await page.goto('https://www.photopea.com', { 
        waitUntil: 'networkidle2', 
        timeout: 60000 
      });
    } catch (navError) {
      console.error('Navigation error:', navError.message);
      throw new Error(`Failed to load Photopea: ${navError.message}`);
    }
    
    // Wait for Photopea to load
    console.log('Waiting for Photopea to initialize...');
    await page.waitForSelector('#appload', { hidden: true, timeout: 30000 });
    
    // Wait for app to be available
    await delay(3000);
    
    // Check if app is available
    const appAvailable = await page.evaluate(() => {
      return window.app && typeof window.app.open === 'function';
    });
    
    if (!appAvailable) {
      throw new Error('Photopea app not available after loading');
    }
    
    console.log('Photopea loaded successfully. Opening PSD template...');
    
    // Read the PSD template
    const psdFile = fs.readFileSync(templatePath);
    const psdBase64 = psdFile.toString('base64');
    
    // Load the PSD template using Photopea's API
    await page.evaluate((psdBase64) => {
      const binary = atob(psdBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      window.app.open(bytes.buffer);
    }, psdBase64);
    
    // Wait for PSD to load
    await delay(5000);
    
    // Check if document is open
    const documentOpen = await page.evaluate(() => {
      return window.app.activeDocument !== null;
    });
    
    if (!documentOpen) {
      throw new Error('Failed to open PSD in Photopea');
    }
    
    // Find design layer
    console.log(`Looking for design layer: ${designLayerName}`);
    const layerFound = await page.evaluate((layerName) => {
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
      
      try {
        const layers = window.app.activeDocument.layers;
        const layer = findLayer(layers, layerName);
        
        if (layer) {
          window.app.activeDocument.activeLayer = layer;
          return true;
        }
        return false;
      } catch (e) {
        console.error('Error finding layer:', e);
        return false;
      }
    }, designLayerName);
    
    if (!layerFound) {
      throw new Error(`Design layer "${designLayerName}" not found in PSD`);
    }
    
    console.log('Design layer found, loading design image...');
    
    // Read the design image
    const designFile = fs.readFileSync(designImagePath);
    const designBase64 = designFile.toString('base64');
    
    // Load design image into Photopea
    await page.evaluate((designBase64) => {
      const binary = atob(designBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      window.app.open(bytes.buffer);
    }, designBase64);
    
    // Wait for design to load
    await delay(3000);
    
    // Process the design
    console.log('Compositing design into template...');
    const success = await page.evaluate(() => {
      try {
        if (window.app.documents.length < 2) {
          return false;
        }
        
        // Design document (second one opened)
        const designDoc = window.app.documents[1];
        designDoc.activate();
        
        // Select everything in the design
        window.app.activeDocument.selection.selectAll();
        window.app.activeDocument.selection.copy();
        
        // Close the design document without saving
        window.app.activeDocument.close(false);
        
        // Go back to the template document
        window.app.documents[0].activate();
        
        // Paste into the active layer (target layer that was selected earlier)
        window.app.activeDocument.paste();
        
        return true;
      } catch (e) {
        console.error('Error processing design:', e);
        return false;
      }
    });
    
    if (!success) {
      throw new Error('Failed to composite design into template');
    }
    
    // Export the mockup as PNG
    console.log('Exporting mockup...');
    const outputPath = path.join(TEMP_DIR, `mockup-${Date.now()}.png`);
    
    const pngBase64 = await page.evaluate(() => {
      try {
        // Export as PNG using Photopea's API
        return window.app.activeDocument.saveToBase64('png');
      } catch (e) {
        console.error('Error exporting PNG:', e);
        return null;
      }
    });
    
    if (!pngBase64) {
      throw new Error('Failed to export mockup from Photopea');
    }
    
    // Write PNG file from base64
    fs.writeFileSync(outputPath, Buffer.from(pngBase64, 'base64'));
    
    console.log(`Mockup exported to: ${outputPath}`);
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
 * @param {string} params.chromePath - Path to Chrome/Chromium executable
 * @param {boolean} params.debug - Enable debug logging
 * @returns {Promise<string>} - Path to the generated mockup
 */
async function generateMockup(params) {
  const {
    templatePath,
    designImagePath,
    designId,
    sku,
    mode = 'auto',
    designLayerName = DESIGN_PLACEHOLDER_NAME,
    chromePath,
    debug = false
  } = params;
  
  if (debug) {
    console.log('Generate mockup params:', {
      templatePath,
      designImagePath,
      designId,
      sku,
      mode,
      designLayerName,
      chromeEnabled: !!chromePath
    });
  }
  
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
          // Set CHROMIUM_PATH environment variable if provided
          if (chromePath) {
            process.env.CHROMIUM_PATH = chromePath;
            console.log(`Using custom Chromium path: ${chromePath}`);
          }
          return generateMockupWithPhotopea(templatePath, designImagePath, designLayerName);
        } else if (mode === 'psdjs') {
          // Only use PSD.js
          console.log(`Using PSD.js mode for mockup generation`);
          return generateMockupWithPsdJs(templatePath, designImagePath, designLayerName);
        } else {
          // Auto mode - try Photopea first, fall back to PSD.js if it fails
          console.log(`Trying Photopea first for mockup generation`);
          try {
            console.log(`Template: ${templatePath}, Layer: ${designLayerName}`);
            
            // Set CHROMIUM_PATH environment variable if provided
            if (chromePath) {
              process.env.CHROMIUM_PATH = chromePath;
              console.log(`Using custom Chromium path: ${chromePath}`);
            }
            
            const mockupPath = await generateMockupWithPhotopea(templatePath, designImagePath, designLayerName);
            return mockupPath;
          } catch (photopeaError) {
            console.error(`Photopea approach failed for template ${templatePath} with layer ${designLayerName}: ${photopeaError.message}`);
            
            try {
              console.log(`Falling back to PSD.js for mockup generation`);
              console.log(`Template: ${templatePath}, Layer: ${designLayerName}`);
              const mockupPath = await generateMockupWithPsdJs(templatePath, designImagePath, designLayerName);
              return mockupPath;
            } catch (psdError) {
              console.error(`PSD.js approach failed for template ${templatePath} with layer ${designLayerName}: ${psdError.message}`);
              console.log(`Falling back to basic mockup generation`);
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
