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
    
    // Close any existing pages and create a fresh page
    const pages = await browser.pages();
    for (const page of pages) {
      await page.close();
    }
    
    const page = await browser.newPage();
    console.log('Created fresh browser page');
    
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
      // Try a more aggressive approach with different waitUntil strategies
      console.log('[DEBUG] Navigating to Photopea with multiple wait strategies...');
      
      // First, try with domcontentloaded which is faster
      await page.goto('https://www.photopea.com', { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      console.log('[DEBUG] Initial page load (domcontentloaded) complete');
      
      // Then wait for networkidle to ensure scripts are loaded
      console.log('[DEBUG] Waiting for network to be idle...');
      await page.waitForNetworkIdle({ timeout: 30000, idleTime: 1000 });
      console.log('[DEBUG] Network is idle');
      
      console.log('[DEBUG] Initial Photopea page navigation successful');
    } catch (navError) {
      console.error('[DEBUG] Navigation error:', navError.message);
      
      // If the first approach fails, try a different strategy
      try {
        console.log('[DEBUG] Trying alternative navigation approach...');
        await page.goto('https://www.photopea.com', { 
          waitUntil: 'networkidle2', 
          timeout: 60000 
        });
        console.log('[DEBUG] Alternative navigation successful');
      } catch (altNavError) {
        console.error('[DEBUG] Alternative navigation also failed:', altNavError.message);
        throw new Error(`Failed to load Photopea: ${altNavError.message}`);
      }
    }
    
    // Force page to have focus (might help with script execution)
    await page.bringToFront();
    
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
    
    // More robust app detection - wait for window.app to be defined
    console.log('Waiting for Photopea app to become available...');
    let appDetected = false;
    try {
      console.log('[DEBUG] Checking if window.app exists using waitForFunction...');
      await page.waitForFunction(() => typeof window.app !== "undefined", {
        timeout: 30000,  // 30 seconds timeout
        polling: 500     // Check every 500ms
      });
      console.log('[DEBUG] window.app detected successfully!');
      appDetected = true;
      
      // Additional check to ensure app.open is available
      console.log('[DEBUG] Checking if window.app.open is a function...');
      await page.waitForFunction(() => typeof window.app.open === "function", {
        timeout: 10000,
        polling: 500
      });
      console.log('[DEBUG] window.app.open function is available!');
    } catch (waitError) {
      console.error('[DEBUG] Timeout waiting for Photopea app to be available:', waitError.message);
      
      // Try to get more diagnostic information about the page state
      try {
        const appStatus = await page.evaluate(() => {
          return {
            windowAppExists: typeof window.app !== 'undefined',
            windowAppType: typeof window.app,
            documentReady: document.readyState,
            hasApploadElement: !!document.getElementById('appload'),
            hasCanvasElement: !!document.querySelector('canvas'),
            windowKeys: Object.keys(window).filter(key => key.length < 20).join(', ')
          };
        });
        
        console.log('[DEBUG] Photopea page state:', JSON.stringify(appStatus, null, 2));
      } catch (evalError) {
        console.error('[DEBUG] Failed to evaluate page state:', evalError.message);
      }
      
      throw new Error(`Photopea app not available: ${waitError.message}`);
    }
    
    // Additional delay to ensure Photopea is fully initialized
    console.log('[DEBUG] Waiting additional time for app to fully initialize...');
    await delay(3000);
    console.log('[DEBUG] Delay completed, proceeding with app check...');
    
    // More reliable app detection
    const appAvailable = await page.evaluate(() => {
      // Check multiple indicators that Photopea is loaded
      console.log('[BROWSER] Checking if Photopea app is ready...');
      
      if (!window.app) {
        console.log('[BROWSER] window.app is not defined');
        return false;
      }
      
      console.log('[BROWSER] window.app exists, checking app.open function...');
      if (typeof window.app.open !== 'function') {
        console.log('[BROWSER] window.app.open is not a function');
        return false;
      }
      
      console.log('[BROWSER] app.open function exists, checking app.activeDocument...');
      if (typeof window.app.activeDocument !== 'undefined') {
        console.log('[BROWSER] app.activeDocument already exists, which suggests Photopea is ready');
        return true;
      }
      
      // Additional checks
      console.log('[BROWSER] Performing additional readiness checks...');
      const readyIndicators = [
        typeof window.app.echoToOE === 'function',
        typeof window.app.addMenuItem === 'function',
        typeof window.PSD !== 'undefined'
      ];
      
      console.log('[BROWSER] Photopea ready indicators:', readyIndicators);
      
      // Return true if most checks pass
      return readyIndicators.filter(Boolean).length >= 2;
    });
    
    console.log('[DEBUG] Photopea app available check result:', appAvailable);
    
    if (!appAvailable) {
      // If the app isn't available after the first check, try a more aggressive approach
      console.log('[DEBUG] Photopea app not detected on first try, using aggressive reload approach...');
      
      // Close current page and open a new one
      console.log('[DEBUG] Closing current page and opening a fresh one...');
      await page.close();
      
      const newPage = await browser.newPage();
      page = newPage; // Reassign the page variable
      
      // Set viewport for the new page
      await page.setViewport({
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
      });
      
      // Monitor console logs for the new page
      page.on('console', msg => console.log(`[BROWSER-NEW] ${msg.type()}: ${msg.text()}`));
      page.on('pageerror', err => console.error('[BROWSER-NEW] Error:', err.message));
      
      // Try a direct load with cache disabled
      console.log('[DEBUG] Attempting navigation with cache disabled...');
      await page.setCacheEnabled(false);
      
      try {
        await page.goto('https://www.photopea.com', { 
          waitUntil: 'networkidle0', 
          timeout: 60000 
        });
        
        console.log('[DEBUG] Waiting longer for app initialization on fresh page...');
        await delay(10000); // Wait longer on fresh page
        
        // Try a more direct approach to check for the app
        const appExists = await page.evaluate(() => {
          console.log('[BROWSER-NEW] Checking app existence after fresh load');
          return typeof window.app !== 'undefined' && typeof window.app.open === 'function';
        });
        
        console.log(`[DEBUG] App exists on fresh page: ${appExists}`);
        
        if (!appExists) {
          // Try manual page reload one more time
          console.log('[DEBUG] App not found, trying manual reload...');
          await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
          await delay(10000);
        }
      } catch (freshLoadError) {
        console.error('[DEBUG] Fresh page navigation failed:', freshLoadError.message);
        throw new Error(`Photopea could not be loaded even with fresh approach: ${freshLoadError.message}`);
      }
      
      // Wait for app to be available using more aggressive timeouts
      console.log('[DEBUG] Checking app availability on fresh page...');
      const freshAppAvailable = await page.evaluate(() => {
        if (typeof window.app === 'undefined') {
          console.log('[BROWSER-NEW] window.app is still undefined after fresh approach');
          return false;
        }
        console.log('[BROWSER-NEW] window.app exists:', typeof window.app);
        return typeof window.app !== 'undefined' && typeof window.app.open === 'function';
      });
      
      if (!freshAppAvailable) {
        console.error('[DEBUG] Photopea app not available even after fresh page approach');
        
        // Try taking a screenshot for diagnosis
        try {
          const screenshotPath = path.join(TEMP_DIR, `photopea-debug-fresh-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`[DEBUG] Saved debug screenshot after fresh approach to ${screenshotPath}`);
        } catch (ssError) {
          console.error('[DEBUG] Failed to take debug screenshot:', ssError.message);
        }
        
        throw new Error('Photopea app not available after fresh page approach');
      }
      
      console.log('[DEBUG] Photopea app available on fresh page');
    } else {
      console.log('[DEBUG] Photopea loaded successfully on first attempt');
    }
    
    console.log('[DEBUG] Photopea loaded successfully. Preparing to open PSD template...');
    
    // Read the PSD template and design image
    const psdFile = fs.readFileSync(templatePath);
    const designFile = fs.readFileSync(designImagePath);
    
    // Convert files to base64
    const psdBase64 = psdFile.toString('base64');
    const designBase64 = designFile.toString('base64');
    
    console.log(`[DEBUG] PSD size: ${psdFile.length} bytes, Design size: ${designFile.length} bytes`);
    
    // Log template information
    console.log('[DEBUG] Template details:', {
      path: templatePath,
      size: psdFile.length,
      type: path.extname(templatePath),
      isPsd: path.extname(templatePath).toLowerCase() === '.psd'
    });
    
    console.log('[DEBUG] Design image details:', {
      path: designImagePath,
      size: designFile.length,
      type: path.extname(designImagePath)
    });
    
    // Create a more robust Photopea script that loads the template and design in one operation
    console.log('[DEBUG] Preparing Photopea script for execution...');
    
    // Wait additional time before script execution to ensure Photopea is fully ready
    console.log('[DEBUG] Waiting additional time before script execution...');
    await delay(2000);
    console.log('[DEBUG] Starting Photopea script execution...');
    
    console.log('=== PHOTOPEA SCRIPT EXECUTION START ===');
    
    try {
      const photopeaScript = await page.evaluate((psdBase64, designBase64, designLayerName) => {
        try {
          console.log("[BROWSER] Starting Photopea script execution");
          
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
          
          // Function to wait for a document to be ready
          function waitForDocument(doc, maxAttempts = 10, delay = 200) {
            return new Promise((resolve, reject) => {
              let attempts = 0;
              
              const checkDocument = () => {
                attempts++;
                console.log(`Checking document ready (attempt ${attempts}/${maxAttempts})...`);
                
                if (doc && doc.layers && doc.layers.length > 0) {
                  console.log("Document is ready with layers");
                  resolve(true);
                } else if (attempts >= maxAttempts) {
                  console.log("Document failed to load properly");
                  reject(new Error("Document not ready after maximum attempts"));
                } else {
                  console.log("Document not ready yet, waiting...");
                  setTimeout(checkDocument, delay);
                }
              };
              
              checkDocument();
            });
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
          
          console.log("PSD loaded, waiting for it to be fully ready...");
          
          // Wait for PSD document to be fully ready with layers
          return waitForDocument(psdDoc)
            .then(() => {
              console.log("PSD loaded successfully with layers");
              
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
              
              console.log("Design image loaded, waiting for it to be fully ready...");
              
              // Wait for design document to be ready
              return waitForDocument(designDoc);
            })
            .then(() => {
              console.log("Design image loaded successfully");
              
              // At this point both documents should be loaded
              
              // Select all in the design document
              app.activeDocument = app.documents[1]; // The design is the second document
              app.activeDocument.selection.selectAll();
              
              // Copy the design
              console.log("Copying design...");
              app.activeDocument.selection.copy();
              
              // Close the design document without saving
              app.activeDocument.close(false);
              
              // Activate the PSD template document
              app.activeDocument = app.documents[0]; // The PSD template is now the first document
              
              // Select the design layer
              const designLayer = findLayerByName(app.activeDocument.layers, designLayerName);
              if (!designLayer) {
                console.log("[BROWSER] Could not find design layer after document switching. Available layers:");
                // Log available layers at this point
                const availableLayers = app.activeDocument.layers.map(l => l.name);
                console.log("[BROWSER] Available layers:", availableLayers.join(", "));
                
                return { 
                  success: false, 
                  error: `Design layer "${designLayerName}" not found after document switching`,
                  layerNames: availableLayers.join(", ")
                };
              }
              
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
            })
            .catch(err => {
              console.error("Error in Photopea script:", err);
              return { 
                success: false, 
                error: err.message || "Unknown error in Photopea script" 
              };
            });
        } catch (err) {
          console.error("[BROWSER] Error in Photopea script:", err);
          return { 
            success: false, 
            error: err.message || "Unknown error in Photopea script" 
          };
        }
      }, psdBase64, designBase64, designLayerName);
      
      console.log('=== PHOTOPEA SCRIPT EXECUTION COMPLETE ===');
      console.log('[DEBUG] Photopea script execution completed:', photopeaScript.success ? 'SUCCESS' : 'FAILED');
      
      if (!photopeaScript.success) {
        console.error('[DEBUG] Photopea script error:', photopeaScript.error);
        if (photopeaScript.layerNames) {
          console.log('[DEBUG] Available layers:', photopeaScript.layerNames);
        }
        throw new Error(`Photopea script failed: ${photopeaScript.error}`);
      }
      
      if (!photopeaScript.png) {
        console.error('[DEBUG] Missing PNG data in Photopea response');
        throw new Error('Photopea did not return PNG data');
      }
      
      console.log('[DEBUG] Successfully received PNG data from Photopea');
      
      // Generate output file path
      const outputPath = path.join(TEMP_DIR, `mockup-${Date.now()}.png`);
      
      // Write PNG file from base64
      console.log(`[DEBUG] Writing PNG data to file: ${outputPath}`);
      fs.writeFileSync(outputPath, Buffer.from(photopeaScript.png, 'base64'));
      
      // Verify the file was written correctly
      if (fs.existsSync(outputPath)) {
        const fileStats = fs.statSync(outputPath);
        console.log(`[DEBUG] Mockup file created: ${outputPath}, size: ${fileStats.size} bytes`);
      } else {
        console.error('[DEBUG] Failed to write mockup file');
      }
      
      console.log(`[DEBUG] Mockup export completed successfully`);
      return outputPath;
    } catch (scriptError) {
      console.error('[DEBUG] Error during Photopea script execution:', scriptError);
      console.error(scriptError.stack);
      throw new Error(`Photopea script execution failed: ${scriptError.message}`);
    }
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
