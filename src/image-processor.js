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
const puppeteer = require('puppeteer-core');
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
  
  console.log('=== PHOTOPEA MOCKUP GENERATION START ===');
  console.log('OS Platform:', process.platform);
  console.log('Node Version:', process.version);
  console.log('Template Path:', templatePath);
  console.log('Design Image Path:', designImagePath);
  console.log('Target Layer Name:', designLayerName);
  
  // Helper function for delays (instead of page.waitFor/waitForTimeout)
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    console.log('Launching Puppeteer for Photopea mockup generation...');
    
    // Get Chrome executable path from environment variables
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
                      process.env.CHROMIUM_PATH || 
                      '/usr/bin/google-chrome-stable';
    
    console.log('[Chrome Path]', chromePath);
    console.log('[Chrome Exists]', require('fs').existsSync(chromePath));
    
    // Configure Puppeteer launch options
    const launchOptions = {
      headless: true,
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote'
      ]
    };
    
    console.log('Launching browser with options:', JSON.stringify(launchOptions, null, 2));
    
    try {
      browser = await puppeteer.launch(launchOptions);
      console.log('Puppeteer launched successfully!');
      
      // Output browser version info
      const version = await browser.version();
      console.log('Browser Version:', version);
    } catch (launchError) {
      console.error('Browser launch failed:', launchError.message);
      console.error(launchError.stack);
      throw launchError;
    }
    
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
    try {
      await page.waitForSelector('#appload', { 
        hidden: true, 
        timeout: 60000 // More generous timeout (60 seconds)
      });
      console.log('Loading indicator hidden, waiting for app to be ready...');
    } catch (timeoutError) {
      console.error('Timeout waiting for Photopea loading indicator to disappear:', timeoutError.message);
      // Continue anyway, since sometimes the loader disappears very quickly
    }
    
    // Wait more time for app to be fully available
    await delay(5000);
    
    // More reliable app detection
    const appAvailable = await page.evaluate(() => {
      // Check multiple indicators that Photopea is loaded
      if (!window.app) {
        console.log('window.app is not defined');
        return false;
      }
      
      if (typeof window.app.open !== 'function') {
        console.log('window.app.open is not a function');
        return false;
      }
      
      if (typeof window.app.activeDocument !== 'undefined') {
        console.log('app.activeDocument already exists, which suggests Photopea is ready');
        return true;
      }
      
      // Additional checks
      const readyIndicators = [
        typeof window.app.echoToOE === 'function',
        typeof window.app.addMenuItem === 'function',
        typeof window.PSD !== 'undefined'
      ];
      
      console.log('Photopea ready indicators:', readyIndicators);
      
      // Return true if most checks pass
      return readyIndicators.filter(Boolean).length >= 2;
    });
    
    if (!appAvailable) {
      // Try a reload and wait again
      console.log('Photopea app not detected on first try, attempting to reload...');
      await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
      
      // Wait for loading indicator again
      try {
        await page.waitForSelector('#appload', { hidden: true, timeout: 60000 });
        console.log('Loading indicator hidden after reload, waiting for app to be ready...');
      } catch (timeoutError) {
        console.error('Timeout waiting for Photopea loading indicator after reload:', timeoutError.message);
      }
      
      // Wait for app to be available after reload
      await delay(8000);
      
      // Check again
      const appAvailableAfterReload = await page.evaluate(() => {
        if (!window.app) {
          console.log('window.app is still not defined after reload');
          return false;
        }
        
        if (typeof window.app.open !== 'function') {
          console.log('window.app.open is still not a function after reload');
          return false;
        }
        
        console.log('After reload: app.open exists =', typeof window.app.open === 'function');
        return window.app && typeof window.app.open === 'function';
      });
      
      if (!appAvailableAfterReload) {
        console.error('Photopea app not available even after reload');
        throw new Error('Photopea app not available after reloading');
      }
      
      console.log('Photopea app available after reload');
    } else {
      console.log('Photopea loaded successfully on first attempt');
    }
    
    console.log('Photopea loaded successfully. Opening PSD template...');
    
    // Read the PSD template and design image
    const psdFile = fs.readFileSync(templatePath);
    const designFile = fs.readFileSync(designImagePath);
    
    // Convert files to base64
    const psdBase64 = psdFile.toString('base64');
    const designBase64 = designFile.toString('base64');
    
    console.log(`PSD size: ${psdFile.length} bytes, Design size: ${designFile.length} bytes`);
    
    // Log template information
    console.log('Template details:', {
      path: templatePath,
      size: psdFile.length,
      type: path.extname(templatePath)
    });
    
    console.log('Design image details:', {
      path: designImagePath,
      size: designFile.length,
      type: path.extname(designImagePath)
    });
    
    // Create a more robust Photopea script that loads the template and design in one operation
    console.log('Preparing Photopea script for execution...');
    
    const photopeaScript = await page.evaluate((psdBase64, designBase64, designLayerName) => {
      try {
        console.log("Starting Photopea script execution");
        
        // Helper function to convert base64 to binary array buffer
        function base64ToArrayBuffer(base64) {
          const binaryString = window.atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes.buffer;
        }
        
        // Function to find a layer by name (including nested layers)
        function findLayerByName(layers, name) {
          console.log(`Searching for layer: "${name}" in ${layers.length} layers`);
          // First try exact match (case-sensitive)
          for (let i = 0; i < layers.length; i++) {
            if (layers[i].name === name) {
              console.log(`Found exact match for layer: ${name}`);
              return layers[i];
            }
            
            // Check nested layers if this is a group
            if (layers[i].layers && layers[i].layers.length > 0) {
              const nestedResult = findLayerByName(layers[i].layers, name);
              if (nestedResult) return nestedResult;
            }
          }
          
          // If no exact match, try case-insensitive
          const lowerName = name.toLowerCase();
          for (let i = 0; i < layers.length; i++) {
            if (layers[i].name.toLowerCase() === lowerName) {
              console.log(`Found case-insensitive match for layer: ${name}`);
              return layers[i];
            }
            
            // Check nested layers if this is a group
            if (layers[i].layers && layers[i].layers.length > 0) {
              const nestedResult = findLayerByName(layers[i].layers, name);
              if (nestedResult) return nestedResult;
            }
          }
          
          // If still no match, try contains
          for (let i = 0; i < layers.length; i++) {
            if (layers[i].name.toLowerCase().includes(lowerName)) {
              console.log(`Found partial match for layer: ${name} -> ${layers[i].name}`);
              return layers[i];
            }
            
            // Check nested layers if this is a group
            if (layers[i].layers && layers[i].layers.length > 0) {
              const nestedResult = findLayerByName(layers[i].layers, name);
              if (nestedResult) return nestedResult;
            }
          }
          
          console.log(`No matching layer found for: ${name}`);
          return null;
        }
        
        // Convert base64 strings to array buffers
        const psdBuffer = base64ToArrayBuffer(psdBase64);
        const designBuffer = base64ToArrayBuffer(designBase64);
        
        // Load the PSD template
        console.log("Loading PSD template...");
        const psdDoc = app.open(psdBuffer);
        
        if (!psdDoc) {
          console.error("Failed to open PSD template");
          return { success: false, error: "Failed to open PSD template" };
        }
        
        console.log("PSD loaded successfully");
        
        // Log layer structure for debugging
        const allLayers = psdDoc.layers;
        console.log(`PSD has ${allLayers.length} top-level layers`);
        
        // Print layer names for debugging
        function printLayerNames(layers, prefix = '') {
          for (let i = 0; i < layers.length; i++) {
            console.log(`${prefix}Layer ${i+1}: "${layers[i].name}"`);
            if (layers[i].layers && layers[i].layers.length > 0) {
              printLayerNames(layers[i].layers, prefix + '  ');
            }
          }
        }
        
        printLayerNames(allLayers);
        
        // Find the design placeholder layer
        const designLayer = findLayerByName(allLayers, designLayerName);
        
        if (!designLayer) {
          console.error(`Could not find design layer with name: ${designLayerName}`);
          return { 
            success: false, 
            error: `Design layer "${designLayerName}" not found`,
            layerNames: allLayers.map(l => l.name).join(', ')
          };
        }
        
        console.log(`Found design layer: ${designLayer.name}`);
        
        // Load the design image in a new document
        console.log("Loading design image...");
        const designDoc = app.open(designBuffer);
        
        if (!designDoc) {
          console.error("Failed to open design image");
          return { success: false, error: "Failed to open design image" };
        }
        
        console.log("Design image loaded successfully");
        
        // Select all in the design document
        designDoc.activate();
        app.activeDocument.selection.selectAll();
        
        // Copy the design
        console.log("Copying design...");
        app.activeDocument.selection.copy();
        
        // Close the design document without saving
        app.activeDocument.close(false);
        
        // Activate the PSD template document
        psdDoc.activate();
        
        // Select the design layer
        app.activeDocument.activeLayer = designLayer;
        
        // Paste into the active layer
        console.log("Pasting design into template...");
        app.activeDocument.paste();
        
        // Flatten the image (after ensuring the design is properly inserted)
        console.log("Flattening image...");
        app.activeDocument.flatten();
        
        // Export as PNG
        console.log("Exporting as PNG...");
        const pngData = app.activeDocument.saveToBase64("png");
        
        return { 
          success: true, 
          png: pngData,
          message: "Mockup generated successfully" 
        };
      } catch (err) {
        console.error("Error in Photopea script:", err);
        return { 
          success: false, 
          error: err.message || "Unknown error in Photopea script" 
        };
      }
    }, psdBase64, designBase64, designLayerName);
    
    console.log('Photopea script execution completed:', photopeaScript.success ? 'SUCCESS' : 'FAILED');
    
    if (!photopeaScript.success) {
      console.error('Photopea script error:', photopeaScript.error);
      throw new Error(`Photopea script failed: ${photopeaScript.error}`);
    }
    
    if (!photopeaScript.png) {
      throw new Error('Photopea did not return PNG data');
    }
    
    // Generate output file path
    const outputPath = path.join(TEMP_DIR, `mockup-${Date.now()}.png`);
    
    // Write PNG file from base64
    fs.writeFileSync(outputPath, Buffer.from(photopeaScript.png, 'base64'));
    
    console.log(`Mockup exported to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating mockup with Photopea:', error);
    throw error;
  } finally {
    if (browser) {
      try {
        console.log('Closing Puppeteer browser...');
        await browser.close();
        console.log('Puppeteer browser closed successfully');
      } catch (closeError) {
        console.error('Error closing browser:', closeError.message);
      }
    }
    console.log('=== PHOTOPEA MOCKUP GENERATION END ===');
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
  if (!templatePath) {
    console.log('No template path provided');
    return 'unknown';
  }
  
  console.log(`Determining template type for: ${templatePath}`);
  const extension = path.extname(templatePath).toLowerCase();
  console.log(`Template file extension: ${extension}`);
  
  if (extension === '.psd') {
    console.log('Template type determined as PSD');
    return 'psd';
  } else if (['.png', '.jpg', '.jpeg'].includes(extension)) {
    console.log(`Template type determined as image format: ${extension}`);
    return 'png'; // treat all image formats as png for simplicity
  }
  
  // If template URL ends with .psd but doesn't have proper extension
  if (templatePath.toLowerCase().endsWith('.psd')) {
    console.log('Template URL ends with .psd but path extension was not detected correctly');
    return 'psd';
  }
  
  console.log(`Unknown template type for extension: ${extension}`);
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
  
  console.log('==== GENERATE MOCKUP START ====');
  console.log('Generate mockup params:', {
    templatePath,
    designImagePath,
    designId,
    sku,
    mode,
    designLayerName,
    chromeEnabled: !!chromePath
  });
  
  try {
    // Check if template exists
    if (templatePath && fs.existsSync(templatePath)) {
      console.log(`Template found: ${templatePath}`);
      
      // Determine template type
      const templateType = getTemplateType(templatePath);
      console.log(`Template type detected: ${templateType}`);
      
      // Handle based on template type and mode
      if (templateType === 'psd') {
        console.log('PSD template detected - will use Photopea or PSD.js');
        
        // For PSD templates, choose the processing approach based on mode
        if (mode === 'photopea' || mode === 'auto') {
          // Preferably use Photopea for PSD files
          console.log(`Using Photopea mode for mockup generation`);
          // Set CHROMIUM_PATH environment variable if provided
          if (chromePath) {
            process.env.CHROMIUM_PATH = chromePath;
            console.log(`Using custom Chromium path: ${chromePath}`);
          }
          
          try {
            console.log(`Starting Photopea processing: Template: ${templatePath}, Layer: ${designLayerName}`);
            const mockupPath = await generateMockupWithPhotopea(templatePath, designImagePath, designLayerName);
            console.log('==== GENERATE MOCKUP END - PHOTOPEA SUCCESS ====');
            return mockupPath;
          } catch (photopeaError) {
            console.error(`Photopea approach failed: ${photopeaError.message}`);
            
            // Only fall back to PSD.js if mode is 'auto'
            if (mode === 'auto') {
              try {
                console.log(`Falling back to PSD.js for mockup generation`);
                const mockupPath = await generateMockupWithPsdJs(templatePath, designImagePath, designLayerName);
                console.log('==== GENERATE MOCKUP END - PSDJS FALLBACK SUCCESS ====');
                return mockupPath;
              } catch (psdError) {
                console.error(`PSD.js approach failed: ${psdError.message}`);
                console.log(`Falling back to basic mockup generation`);
                // If both methods fail, fall back to basic mockup
                const mockupPath = await generateBasicMockup(designImagePath, `${sku} mockup`);
                console.log('==== GENERATE MOCKUP END - BASIC FALLBACK SUCCESS ====');
                return mockupPath;
              }
            } else {
              // If mode is specifically 'photopea', propagate the error
              throw photopeaError;
            }
          }
        } else if (mode === 'psdjs') {
          // Only use PSD.js
          console.log(`Using PSD.js mode for mockup generation`);
          const mockupPath = await generateMockupWithPsdJs(templatePath, designImagePath, designLayerName);
          console.log('==== GENERATE MOCKUP END - PSDJS SUCCESS ====');
          return mockupPath;
        }
      } else if (templateType === 'png') {
        // If it's a PNG template, use the PNG processor
        console.log('Using PNG template processor');
        const mockupPath = await generateMockupWithPngTemplate(templatePath, designImagePath);
        console.log('==== GENERATE MOCKUP END - PNG SUCCESS ====');
        return mockupPath;
      } else {
        // Unknown template type, fall back to basic mockup
        console.log(`Unsupported template type: ${templateType}, using basic mockup`);
        const mockupPath = await generateBasicMockup(designImagePath, `${sku} mockup`);
        console.log('==== GENERATE MOCKUP END - BASIC SUCCESS (UNSUPPORTED TYPE) ====');
        return mockupPath;
      }
    } else {
      // No template available, generate a basic mockup
      console.log(`No template available for ${sku}, generating basic mockup`);
      const mockupPath = await generateBasicMockup(designImagePath, `${sku} mockup`);
      console.log('==== GENERATE MOCKUP END - BASIC SUCCESS (NO TEMPLATE) ====');
      return mockupPath;
    }
  } catch (error) {
    console.error(`Failed to generate mockup: ${error.message}`);
    console.error(error.stack);
    console.log('==== GENERATE MOCKUP END - ERROR ====');
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
