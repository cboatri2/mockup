const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { generateMockup } = require('./image-processor');

// Configuration
const PORT = process.env.PORT || 3000;

// IMPORTANT: Force test mode for now
const TEST_MODE = true;

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
      return res.status(500).json({
        success: false,
        error: 'Mockup generation failed: ' + processingError.message
      });
    }
    
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Internal server error"
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`======================================`);
  console.log(`PSD Mockup Service running on port ${PORT}`);
  console.log(`TEST MODE: ${TEST_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log(`======================================`);
});
