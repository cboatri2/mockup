// Ultra-simple Express server for Railway
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// Setup app
const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ ok: true, version: "1.0.0" });
});

// CORS test endpoint
app.get("/cors-test", (req, res) => {
  res.json({
    success: true,
    message: "CORS is working correctly",
    timestamp: new Date().toISOString()
  });
});

// Mockup generation - simplified to just return the original image
app.post("/render-mockup", (req, res) => {
  try {
    const { designId, sku, imageUrl } = req.body;
    
    if (!designId || !sku || !imageUrl) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: designId, sku, imageUrl" 
      });
    }
    
    console.log(`Mockup request: design=${designId}, sku=${sku}`);
    
    // Simply return the original image URL as mockup
    // This avoids any complex processing that might cause issues
    return res.json({
      success: true,
      mockupUrl: imageUrl,
      designId,
      sku,
      message: "Simplified mockup service - returns original image"
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
  console.log(`Ultra-simple Mockup Service running on port ${PORT}`);
  console.log(`All /render-mockup requests will return original image`);
  console.log(`======================================`);
});
