// Express server for mockup generation
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { downloadDesignImage, cleanupFiles } = require("./downloader");
const axios = require('axios');
const puppeteer = require('puppeteer-core');

// Import image processor (with PSD.js functionality)
const imageProcessor = require("./image-processor");

// Import routes
const healthRoutes = require('./routes/health');

// Load configuration from config.json if it exists
let config = {};
const configPath = path.join(__dirname, '..', 'config.json');
if (fs.existsSync(configPath)) {
  try {
    config = require(configPath);
    console.log('Loaded configuration from config.json');
  } catch (err) {
    console.error('Error loading config.json:', err.message);
  }
}

// Setup app
const app = express();
const PORT = process.env.PORT || config.serviceSettings?.port || 3001;
const BASE_URL = process.env.BASE_URL || config.serviceSettings?.baseUrl || `http://localhost:${PORT}`;
const PUBLIC_PATH = process.env.PUBLIC_PATH || '/mockups';
const IS_RAILWAY = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_SERVICE_NAME || false;

// Template configuration with precedence for environment variables over config.json
const USE_REMOTE_TEMPLATES = !!(process.env.PSD_TEMPLATE_URL || config.templateSettings?.psdTemplateUrl);
const PSD_TEMPLATE_URL = process.env.PSD_TEMPLATE_URL || config.templateSettings?.psdTemplateUrl;
const DESIGN_PLACEHOLDER_NAME = process.env.DESIGN_PLACEHOLDER_NAME || config.templateSettings?.designPlaceholderName || 'Design';

// Layer names to try when looking for the design placeholder layer
const LAYER_NAMES = config.layerNames || ["Design Placeholder", "Design", "YOUR DESIGN", "YOUR DESIGN HERE", "DESIGN", "DESIGN HERE", "place-design", "design-placeholder"];

// Check for Chrome/Chromium paths (used by Puppeteer)
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || 
                    process.env.CHROMIUM_PATH || 
                    '/usr/bin/google-chrome';

// Enable debug logging by default on Railway for troubleshooting
const DEBUG = IS_RAILWAY || process.env.DEBUG === 'true' || config.debug === true;

// Log configuration for debugging - always show in Railway
console.log('Configuration:', {
  useRemoteTemplates: USE_REMOTE_TEMPLATES,
  psdTemplateUrl: PSD_TEMPLATE_URL,
  designPlaceholderName: DESIGN_PLACEHOLDER_NAME,
  layerNames: LAYER_NAMES,
  corsOrigin: process.env.CORS_ORIGIN || config.corsSettings?.allowedOrigins || '*',
  baseUrl: BASE_URL,
  isRailway: IS_RAILWAY,
  chromePath: CHROME_PATH,
  nodePath: process.execPath,
  nodeVersion: process.version
});

// Define template and temp directories
const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Ensure directories exist
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  console.log(`Created templates directory: ${TEMPLATES_DIR}`);
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  console.log(`Created temp directory: ${TEMP_DIR}`);
}

// Get the allowed origin from environment variable or config.json or allow all in development
const corsOrigin = process.env.CORS_ORIGIN || (config.corsSettings?.allowedOrigins ? config.corsSettings.allowedOrigins : '*');
console.log(`CORS Origin: ${corsOrigin}`);

// Define CORS configuration
const corsConfig = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Parse the allowed origins from config or environment
    let allowedOrigins = [];
    
    if (typeof corsOrigin === 'string') {
      if (corsOrigin === '*') {
        return callback(null, true); // Allow all origins
      } else {
        allowedOrigins = [corsOrigin]; // Single origin
      }
    } else if (Array.isArray(corsOrigin)) {
      allowedOrigins = corsOrigin; // Array of origins
    } else if (config.corsSettings?.allowedOrigins) {
      allowedOrigins = config.corsSettings.allowedOrigins; // From config
    }
    
    // Check if the origin is allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log(`CORS blocked request from: ${origin}`);
      console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
      
      // In debug mode, allow all origins for easier testing
      if (DEBUG) {
        console.log('DEBUG mode: Allowing origin despite not being in allowlist');
        return callback(null, true);
      }
      
      // Don't include error details in production
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsConfig));
app.use(express.json());

// Add preflight handling
app.options('*', cors(corsConfig));

/**
 * Find the best template for a given SKU
 * @param {string} sku - The product SKU
 * @returns {Promise<string|null>} - Path to the template or null if not found
 */
async function findTemplateForSku(sku) {
  if (DEBUG) {
    console.log(`Finding template for SKU: ${sku}`);
    console.log(`Using PSD_TEMPLATE_URL: ${PSD_TEMPLATE_URL}`);
  }
  
  // First check local templates - faster than remote retrieval
  const templateFormats = ['.psd', '.png', '.jpg', '.jpeg'];
  
  // Look for template with exact SKU match in different formats
  for (const format of templateFormats) {
    const exactPath = path.join(TEMPLATES_DIR, `${sku}${format}`);
    if (fs.existsSync(exactPath)) {
      if (DEBUG) console.log(`Found local template for SKU ${sku}: ${exactPath}`);
      return exactPath;
    }
  }
  
  // If no exact match, look for default templates
  for (const format of templateFormats) {
    const defaultPath = path.join(TEMPLATES_DIR, `default${format}`);
    if (fs.existsSync(defaultPath)) {
      if (DEBUG) console.log(`Using default local template: ${defaultPath}`);
      return defaultPath;
    }
  }
  
  // If remote templates are enabled and no local template was found, try to download
  if (USE_REMOTE_TEMPLATES && PSD_TEMPLATE_URL) {
    try {
      console.log(`Attempting to download template from remote source: ${PSD_TEMPLATE_URL}`);
      
      // Check if PSD_TEMPLATE_URL is a direct file URL or a base directory
      const isDirectPsdUrl = PSD_TEMPLATE_URL.toLowerCase().endsWith('.psd');
      
      if (isDirectPsdUrl) {
        // Direct URL to a PSD file - use for all SKUs
        const remoteTemplatePath = path.join(TEMP_DIR, `template-${sku}.psd`);
        
        try {
          if (DEBUG) console.log(`Downloading template from ${PSD_TEMPLATE_URL} to ${remoteTemplatePath}`);
          
          const response = await axios.get(PSD_TEMPLATE_URL, { 
            responseType: 'arraybuffer',
            timeout: 15000 // 15 second timeout
          });
          
          if (DEBUG) console.log(`Download complete: ${response.status}, data size: ${response.data.length} bytes`);
          
          fs.writeFileSync(remoteTemplatePath, response.data);
          console.log(`Downloaded template from ${PSD_TEMPLATE_URL}`);
          
          // Verify the template was saved correctly
          if (fs.existsSync(remoteTemplatePath)) {
            const stats = fs.statSync(remoteTemplatePath);
            if (DEBUG) console.log(`Template saved, size: ${stats.size} bytes`);
            
            if (stats.size > 0) {
              return remoteTemplatePath;
            } else {
              console.error(`Downloaded template file is empty: ${remoteTemplatePath}`);
              return null;
            }
          } else {
            console.error(`Failed to save template to: ${remoteTemplatePath}`);
            return null;
          }
        } catch (error) {
          console.error(`Error downloading template: ${error.message}`);
          if (DEBUG && error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response headers:`, error.response.headers);
          }
          return null;
        }
      } else {
        // Base URL - try SKU-specific and default templates
        // Try to download SKU-specific template
        const remoteTemplatePath = path.join(TEMP_DIR, `${sku}.psd`);
        const remoteTemplateUrl = `${PSD_TEMPLATE_URL}/${sku}.psd`;
        
        try {
          const response = await axios.get(remoteTemplateUrl, { responseType: 'arraybuffer' });
          fs.writeFileSync(remoteTemplatePath, response.data);
          console.log(`Downloaded template from ${remoteTemplateUrl}`);
          return remoteTemplatePath;
        } catch (error) {
          console.log(`No SKU-specific template found at ${remoteTemplateUrl}, trying default`);
          
          // Try to download default template
          const defaultTemplatePath = path.join(TEMP_DIR, `default.psd`);
          const defaultTemplateUrl = `${PSD_TEMPLATE_URL}/default.psd`;
          
          try {
            const response = await axios.get(defaultTemplateUrl, { responseType: 'arraybuffer' });
            fs.writeFileSync(defaultTemplatePath, response.data);
            console.log(`Downloaded default template from ${defaultTemplateUrl}`);
            return defaultTemplatePath;
          } catch (defaultError) {
            console.log(`No default template found at ${defaultTemplateUrl}`);
            return null;
          }
        }
      }
    } catch (error) {
      console.error(`Error downloading remote template: ${error.message}`);
      return null;
    }
  }
  
  // No template found
  return null;
}

// Register routes
healthRoutes(app);

// CORS test endpoint
app.get("/cors-test", (req, res) => {
  res.json({
    success: true,
    message: "CORS is working correctly",
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Test Puppeteer and Photopea endpoint
app.get("/test-photopea", async (req, res) => {
  console.log('=== TESTING PUPPETEER WITH PHOTOPEA ===');
  
  try {
    // Get Chrome executable path from environment variables
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
                       process.env.CHROMIUM_PATH || 
                       CHROME_PATH;
    
    console.log('[Chrome Path]', chromePath);
    
    // Check if Chrome exists
    const chromeExists = fs.existsSync(chromePath);
    console.log('[Chrome Exists]', chromeExists);
    
    if (!chromeExists) {
      return res.status(500).send(`❌ Chrome not found at path: ${chromePath}`);
    }
    
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
    
    // Try to launch browser
    const browser = await puppeteer.launch(launchOptions);
    console.log('Browser launched successfully!');
    
    // Get browser version
    const version = await browser.version();
    console.log('Browser version:', version);
    
    // Create a new page
    const page = await browser.newPage();
    console.log('Page created successfully!');
    
    // Set a timeout for navigation
    await page.setDefaultNavigationTimeout(30000);
    
    // Try navigating to Photopea
    console.log('Navigating to Photopea...');
    await page.goto('https://www.photopea.com', { waitUntil: 'domcontentloaded' });
    console.log('Navigation to Photopea successful!');
    
    // Take a screenshot as proof
    const screenshotPath = path.join(TEMP_DIR, `photopea-test-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);
    
    // Close the browser
    await browser.close();
    console.log('Browser closed successfully!');
    
    // Send success response
    res.status(200).send(`✅ Puppeteer launched and Photopea loaded successfully. Browser: ${version}`);
  } catch (error) {
    console.error('Error in Photopea test:', error);
    
    // Send error response
    res.status(500).send(`❌ Puppeteer failed: ${error.message}`);
  }
});

// Test Puppeteer browser launch and basic operations
app.get("/test-browser", async (req, res) => {
  console.log('=== BROWSER TEST START ===');
  
  try {
    // Get Chrome executable path from environment variables
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
                       process.env.CHROMIUM_PATH || 
                       CHROME_PATH;
    
    console.log('[Chrome Path]', chromePath);
    
    // Check if Chrome exists
    const chromeExists = fs.existsSync(chromePath);
    console.log('[Chrome Exists]', chromeExists);
    
    if (!chromeExists) {
      return res.status(500).send(`❌ Chrome not found at path: ${chromePath}`);
    }
    
    // Configure Puppeteer launch options - match exactly what the image processor uses
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
    
    // Try to launch browser
    const browser = await puppeteer.launch(launchOptions);
    console.log('Browser launched successfully!');
    
    // Get browser version
    const version = await browser.version();
    console.log('Browser version:', version);
    
    // Create a new page
    const page = await browser.newPage();
    console.log('Page created successfully!');
    
    // Set a timeout for navigation
    await page.setDefaultNavigationTimeout(30000);
    
    // Try navigating to a test page
    console.log('Navigating to example.com...');
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    console.log('Navigation to example.com successful!');
    
    // Take a screenshot as proof
    const screenshotPath = path.join(TEMP_DIR, `browser-test-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);
    
    // Get page title as further verification
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Try evaluating JavaScript
    const jsTest = await page.evaluate(() => {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      };
    });
    
    console.log('JavaScript evaluation successful:', jsTest);
    
    // Close the browser
    await browser.close();
    console.log('Browser closed successfully!');
    console.log('=== BROWSER TEST END ===');
    
    // Create a screenshot URL for verification
    const screenshotUrl = `${BASE_URL}${PUBLIC_PATH}/${path.basename(screenshotPath)}`;
    
    // Send success response
    res.status(200).send(`
      ✅ Puppeteer browser test successful!
      
      Browser: ${version}
      Page Title: ${title}
      User Agent: ${jsTest.userAgent}
      Platform: ${jsTest.platform}
      
      Screenshot: <a href="${screenshotUrl}" target="_blank">${screenshotUrl}</a>
    `);
  } catch (error) {
    console.error('Error in browser test:', error);
    console.error(error.stack || 'No stack trace available');
    console.log('=== BROWSER TEST FAILED ===');
    
    // Send detailed error response
    res.status(500).send(`
      ❌ Puppeteer browser test failed!
      
      Error: ${error.message}
      
      Details:
      Chrome Path: ${process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || CHROME_PATH}
      Chrome Exists: ${fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || CHROME_PATH)}
      Node Version: ${process.version}
      Platform: ${process.platform}
    `);
  }
});

// Endpoint to serve mockup images directly
app.use('/mockups', express.static(TEMP_DIR));

// Mockup generation with advanced functionality
app.post("/render-mockup", async (req, res) => {
  console.log('=== RENDER MOCKUP REQUEST START ===');
  console.log('Request IP:', req.ip);
  console.log('Request Origin:', req.get('origin'));
  
  // Track timing for performance diagnostics
  const startTime = Date.now();
  
  try {
    const { designId, sku, imageUrl, mode } = req.body;
    
    // Log the request but mask part of the image URL for privacy
    console.log('Mockup request received:', {
      designId,
      sku,
      imageUrl: imageUrl ? `${imageUrl.substring(0, 50)}...` : undefined,
      mode,
      timestamp: new Date().toISOString()
    });
    
    if (!designId || !sku || !imageUrl) {
      console.error('Missing required fields in request');
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: designId, sku, imageUrl" 
      });
    }
    
    // Determine processing mode (default to 'auto')
    const processingMode = mode || 'auto';
    console.log(`Mockup request: design=${designId}, sku=${sku}, mode=${processingMode}`);
    
    // Find the best template for this SKU
    const templatePath = await findTemplateForSku(sku);
    
    if (templatePath) {
      console.log(`Found template for SKU ${sku}: ${templatePath}`);
    } else {
      console.log(`No template found for SKU: ${sku}, using fallback`);
    }
    
    // Create a unique temp directory for this job
    const jobId = `${designId}-${sku}-${Date.now()}`;
    const jobDir = path.join(TEMP_DIR, jobId);
    
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    
    // First, try to download the design image
    let designImagePath;
    try {
      console.log(`Downloading design image from: ${imageUrl.substring(0, 50)}...`);
      designImagePath = await downloadDesignImage(imageUrl, jobDir);
      console.log(`Design image downloaded to: ${designImagePath}`);
    } catch (downloadError) {
      console.error(`Failed to download design image: ${downloadError.message}`);
      // If we fail to download the image, return an error
      return res.json({
        success: false,
        error: `Failed to download design image: ${downloadError.message}`,
        mockupUrl: imageUrl,
        designId,
        sku
      });
    }
    
    let mockupPath;
    let mockupUrl;
    let processingStatus = {
      templateFound: !!templatePath,
      templateType: templatePath ? path.extname(templatePath).toLowerCase().substring(1) : null,
      methodUsed: null,
      fallbackUsed: false,
      environment: IS_RAILWAY ? 'railway' : 'local',
      chromePath: CHROME_PATH,
      requestTime: new Date().toISOString(),
      requestOrigin: req.get('origin'),
      processingTimeMs: 0
    };
    
    console.log('Processing status before mockup generation:', processingStatus);
    console.log('Design layer names to try:', LAYER_NAMES);
    
    // Generate mockup using the appropriate method based on template type
    try {
      // Try to use each potential layer name in order until one works
      let mockupError = null;
      console.log(`Beginning mockup generation with ${LAYER_NAMES.length} potential layer names`);
      
      for (const layerName of LAYER_NAMES) {
        try {
          console.log(`Attempting mockup generation with layer name: ${layerName}`);
          
          // Timeout for mockup generation (3 minutes)
          const timeoutMs = 3 * 60 * 1000;
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Mockup generation timed out after ${timeoutMs}ms`)), timeoutMs)
          );
          
          // Actual mockup generation
          const mockupPromise = imageProcessor.generateMockup({
            templatePath,
            designImagePath,
            designId,
            sku,
            mode: processingMode, 
            designLayerName: layerName,
            debug: DEBUG,
            chromePath: CHROME_PATH
          });
          
          // Race between timeout and mockup generation
          mockupPath = await Promise.race([mockupPromise, timeoutPromise]);
          
          // If we reach here, the mockup was generated successfully
          console.log(`Mockup generated successfully with layer name: ${layerName}`);
          mockupError = null;
          break;
        } catch (error) {
          console.log(`Layer name "${layerName}" failed: ${error.message}`);
          mockupError = error;
          
          // Short delay before trying next layer name
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // If all layer names failed, throw the last error
      if (mockupError) {
        throw mockupError;
      }
      
      // Determine which method was used based on file type and mode
      if (!templatePath) {
        processingStatus.methodUsed = 'basic';
      } else if (processingStatus.templateType === 'png' || 
                processingStatus.templateType === 'jpg' || 
                processingStatus.templateType === 'jpeg') {
        processingStatus.methodUsed = 'png';
      } else if (processingMode === 'psdjs') {
        processingStatus.methodUsed = 'psdjs';
      } else if (processingMode === 'photopea') {
        processingStatus.methodUsed = 'photopea';
      } else {
        // For auto mode, we can't be sure which was used, so we'll say "advanced"
        processingStatus.methodUsed = 'advanced';
      }
      
      console.log(`Mockup generated at: ${mockupPath} using ${processingStatus.methodUsed} method`);
    } catch (mockupError) {
      console.error(`Failed to generate mockup: ${mockupError.message}`);
      console.error('Error details:', mockupError.stack || 'No stack trace available');
      
      // If all mockup generation methods fail, fall back to basic mockup
      try {
        console.log('All methods failed, falling back to basic mockup generation');
        mockupPath = await imageProcessor.generateBasicMockup(designImagePath, `${sku} mockup`);
        console.log(`Fallback basic mockup generated at: ${mockupPath}`);
        
        processingStatus.methodUsed = 'basic';
        processingStatus.fallbackUsed = true;
        processingStatus.error = mockupError.message;
      } catch (fallbackError) {
        console.error(`Even basic mockup failed: ${fallbackError.message}`);
        
        // If even the basic mockup fails, return the original image
        return res.json({
          success: false,
          error: `Mockup generation failed: ${mockupError.message}`,
          fallbackError: fallbackError.message,
          // Return the original image URL as mockupUrl so the UI can still show something
          mockupUrl: imageUrl
        });
      }
    }
    
    // Create a URL for the mockup using configured BASE_URL
    const mockupFilename = path.basename(mockupPath);
    mockupUrl = `${BASE_URL}${PUBLIC_PATH}/${mockupFilename}`;
    
    // Clean up temporary files (except the final mockup)
    try {
      await cleanupFiles(designImagePath);
    } catch (cleanupError) {
      console.error(`Error during cleanup: ${cleanupError.message}`);
    }
    
    // Calculate processing time
    processingStatus.processingTimeMs = Date.now() - startTime;
    
    console.log(`Mockup generation completed in ${processingStatus.processingTimeMs}ms`);
    console.log(`Mockup URL: ${mockupUrl}`);
    console.log('=== RENDER MOCKUP REQUEST END ===');
    
    return res.json({
      success: true,
      mockupUrl,
      designId,
      sku,
      processingDetails: processingStatus,
      localPath: mockupPath // For debugging
    });
    
  } catch (error) {
    console.error("Error in render-mockup endpoint:", error);
    console.error(error.stack || 'No stack trace available');
    
    // Calculate processing time
    const processingTimeMs = Date.now() - startTime;
    console.log(`Request failed after ${processingTimeMs}ms`);
    console.log('=== RENDER MOCKUP REQUEST FAILED ===');
    
    res.status(200).json({ 
      success: false, 
      error: error.message || "Error processing request",
      mockupUrl: req.body?.imageUrl || null,
      processingTimeMs
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`======================================`);
  console.log(`PSD Mockup Service running on port ${PORT}`);
  console.log(`BASE URL: ${BASE_URL}`);
  console.log(`TEMPLATES DIR: ${TEMPLATES_DIR}`);
  console.log(`TEMP DIR: ${TEMP_DIR}`);
  console.log(`======================================`);
});
