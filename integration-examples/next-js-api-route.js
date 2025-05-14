/**
 * Example Next.js API route for integrating with PSD Mockup Service
 * 
 * This file would typically be placed in your Next.js app at:
 * pages/api/mockups/generate.js
 */

import axios from 'axios';

// Get the mockup service URL from environment variables
const MOCKUP_SERVICE_URL = process.env.MOCKUP_SERVICE_URL || 'https://your-mockup-service-url.railway.app';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract parameters from request body
    const { designId, sku, imageUrl, mode = 'auto' } = req.body;
    
    // Validate required parameters
    if (!designId || !sku || !imageUrl) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        required: ['designId', 'sku', 'imageUrl']
      });
    }
    
    console.log(`Generating mockup for design ${designId}, SKU ${sku}, mode ${mode}`);
    
    // Call the mockup service
    const response = await axios.post(`${MOCKUP_SERVICE_URL}/render-mockup`, {
      designId,
      sku,
      imageUrl,
      mode
    });
    
    // Return the mockup service response
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error generating mockup:', error);
    
    // Handle connection errors vs. service errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({ 
        error: 'Mockup service unavailable',
        details: 'Could not connect to the mockup service. Please check if it is running.'
      });
    }
    
    // Handle other errors
    return res.status(500).json({ 
      error: 'Error generating mockup', 
      details: error.message,
      // Include the original error response if available
      serviceResponse: error.response?.data || null
    });
  }
} 