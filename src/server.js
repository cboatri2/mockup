// Express server for mockup generation
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { downloadDesignImage, cleanupFiles } = require("./downloader");
const axios = require('axios');

// Import image processor (with PSD.js functionality)
const imageProcessor = require("./image-processor");

// Setup app
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PUBLIC_PATH = process.env.PUBLIC_PATH || '/mockups';

// Template configuration
const USE_REMOTE_TEMPLATES = !!process.env.PSD_TEMPLATE_URL;
const PSD_TEMPLATE_URL = process.env.PSD_TEMPLATE_URL;
const DESIGN_PLACEHOLDER_NAME = process.env.DESIGN_PLACEHOLDER_NAME || 'Design';

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

// Get the allowed origin from environment variable or allow all in development
const corsOrigin = process.env.CORS_ORIGIN || '*';
console.log(`CORS Origin: ${corsOrigin}`);

// Basic middleware
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

/**
 * Find the best template for a given SKU
 * @param {string} sku - The product SKU
 * @returns {Promise<string|null>} - Path to the template or null if not found
 */
async function findTemplateForSku(sku) {
  // First check local templates - faster than remote retrieval
  const templateFormats = ['.psd', '.png', '.jpg', '.jpeg'];
  
  // Look for template with exact SKU match in different formats
  for (const format of templateFormats) {
    const exactPath = path.join(TEMPLATES_DIR, `${sku}${format}`);
    if (fs.existsSync(exactPath)) {
      return exactPath;
    }
  }
  
  // If no exact match, look for default templates
  for (const format of templateFormats) {
    const defaultPath = path.join(TEMPLATES_DIR, `default${format}`);
    if (fs.existsSync(defaultPath)) {
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
          const response = await axios.get(PSD_TEMPLATE_URL, { responseType: 'arraybuffer' });
          fs.writeFileSync(remoteTemplatePath, response.data);
          console.log(`Downloaded template from ${PSD_TEMPLATE_URL}`);
          return remoteTemplatePath;
        } catch (error) {
          console.error(`Error downloading template: ${error.message}`);
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    ok: true, 
    version: "1.0.0", 
    baseUrl: BASE_URL,
    env: process.env.NODE_ENV || 'development',
    features: {
      psdjs: true,
      photopea: true,
      pngTemplates: true,
      basicMockup: true,
      remoteTemplates: USE_REMOTE_TEMPLATES
    }
  });
});

// CORS test endpoint
app.get("/cors-test", (req, res) => {
  res.json({
    success: true,
    message: "CORS is working correctly",
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Endpoint to serve mockup images directly
app.use('/mockups', express.static(TEMP_DIR));

// Mockup generation with advanced functionality
app.post("/render-mockup", async (req, res) => {
  try {
    const { designId, sku, imageUrl, mode } = req.body;
    
    if (!designId || !sku || !imageUrl) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: designId, sku, imageUrl" 
      });
    }
    
    // Determine processing mode (default to 'auto')
    const processingMode = mode || 'auto';
    console.log(`Mockup request: design=${designId}, sku=${sku}, mode=${processingMode}, image=${imageUrl}`);
    
    // Find the best template for this SKU
    const templatePath = await findTemplateForSku(sku);
    
    if (templatePath) {
      console.log(`Found template for SKU ${sku}: ${templatePath}`);
    } else {
      console.log(`No template found for SKU: ${sku}`);
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
      fallbackUsed: false
    };
    
    // Generate mockup using the appropriate method based on template type
    try {
      mockupPath = await imageProcessor.generateMockup({
        templatePath,
        designImagePath,
        designId,
        sku,
        mode: processingMode,
        designLayerName: DESIGN_PLACEHOLDER_NAME
      });
      
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
      // If all mockup generation methods fail, fall back to basic mockup
      mockupPath = await imageProcessor.generateBasicMockup(designImagePath, `${sku} mockup`);
      console.log(`Fallback basic mockup generated at: ${mockupPath}`);
      
      processingStatus.methodUsed = 'basic';
      processingStatus.fallbackUsed = true;
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
    
    return res.json({
      success: true,
      mockupUrl,
      designId,
      sku,
      processingDetails: processingStatus,
      localPath: mockupPath // For debugging
    });
    
  } catch (error) {
    console.error("Error:", error);
    res.status(200).json({ 
      success: false, 
      error: error.message || "Error processing request",
      mockupUrl: req.body?.imageUrl || null
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
