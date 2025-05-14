const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { generateMockup } = require('./image-processor');

// Configuration
const PORT = process.env.PORT || 3000;

// IMPORTANT: Force test mode to false for production
const TEST_MODE = false;

// Setup directories
const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Ensure directories exist
function ensureDirectoriesExist() {
  try {
    [TEMPLATES_DIR, TEMP_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });
  } catch (error) {
    console.error(`Error creating directories:`, error);
    // Continue execution even if directory creation fails
  }
}

// Initialize app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    ok: true, 
    version: "1.0.0"
  });
});

// Mockup generation endpoint
app.post("/render-mockup", async (req, res) => {
  try {
    const { designId, sku, imageUrl } = req.body;
    
    if (!designId || !sku || !imageUrl) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: designId, sku, imageUrl" 
      });
    }
    
    console.log(`Processing mockup request for design ${designId}, product ${sku}`);
    
    // Always use test mode for now
    if (TEST_MODE) {
      console.log('TEST MODE: Skipping actual mockup generation');
      
      // Return the original image URL in test mode
      return res.json({
        success: true,
        mockupUrl: imageUrl,
        designId,
        sku,
        testMode: true
      });
    }
    
    // This code will only run if test mode is disabled
    try {
      const mockupUrl = await generateMockup({ designId, sku, imageUrl });
      
      res.json({
        success: true,
        mockupUrl,
        designId,
        sku
      });
    } catch (processingError) {
      console.error('Error in mockup generation:', processingError);
      
      // In case of error, return the original image as the mockup
      // This prevents the UI from breaking while we diagnose issues
      return res.json({
        success: true,
        mockupUrl: imageUrl,
        designId,
        sku,
        error: processingError.message,
        errorFallback: true
      });
    }
    
  } catch (error) {
    console.error("Error:", error);
    
    // Return a 200 response with error info instead of 500
    // This way the UI can still function with the original image
    res.json({ 
      success: false, 
      error: error.message || "Internal server error",
      // Include the original image URL as a fallback
      mockupUrl: req.body?.imageUrl || null
    });
  }
});

// Create necessary directories before starting the server
ensureDirectoriesExist();

// Start the server
const server = app.listen(PORT, () => {
  console.log(`======================================`);
  console.log(`PSD Mockup Service running on port ${PORT}`);
  console.log(`TEST MODE: ${TEST_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log(`TEMPLATES DIR: ${TEMPLATES_DIR}`);
  console.log(`TEMP DIR: ${TEMP_DIR}`);
  console.log(`======================================`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
