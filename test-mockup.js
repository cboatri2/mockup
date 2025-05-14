/**
 * Test script for PSD Mockup Service
 * This script directly tests the image-processor module and HTTP endpoints
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadDesignImage } = require('./src/downloader');
const imageProcessor = require('./src/image-processor');

// Test configuration
const TEST_IMAGE_URL = 'https://placehold.co/400x400/FFFF00/000000.png';
const TEST_DESIGN_ID = 'test-design-123';
const TEST_SKU = 'test-sku-456';
const SERVICE_URL = 'http://localhost:3002';

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Create PSD template directory if it doesn't exist
const TEMPLATES_DIR = path.join(__dirname, 'assets', 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

// Test function
async function testMockupGeneration() {
  console.log('==== MOCKUP SERVICE TEST ====');
  
  try {
    // Check service health
    console.log('\n=== Testing service health ===');
    const healthResponse = await axios.get(`${SERVICE_URL}/health`);
    console.log('Health status:', healthResponse.data);
    
    // Create a job directory
    const jobDir = path.join(TEMP_DIR, `test-job-${Date.now()}`);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    
    // Download the test image
    console.log(`\n=== Downloading test image ===`);
    console.log(`Downloading from ${TEST_IMAGE_URL}`);
    const designImagePath = await downloadDesignImage(TEST_IMAGE_URL, jobDir);
    console.log(`Downloaded test image to ${designImagePath}`);
    
    // Test basic mockup generation (without PSD template)
    console.log('\n=== Testing basic mockup generation ===');
    const basicMockupPath = await imageProcessor.generateBasicMockup(
      designImagePath,
      `${TEST_SKU} mockup`
    );
    console.log(`Basic mockup generated at: ${basicMockupPath}`);
    console.log(`File exists: ${fs.existsSync(basicMockupPath)}`);
    
    // Test HTTP endpoint with different modes
    const modes = ['auto', 'psdjs', 'photopea'];
    
    for (const mode of modes) {
      console.log(`\n=== Testing HTTP endpoint with mode: ${mode} ===`);
      
      try {
        const response = await axios.post(`${SERVICE_URL}/render-mockup`, {
          designId: TEST_DESIGN_ID,
          sku: TEST_SKU,
          imageUrl: TEST_IMAGE_URL,
          mode: mode
        });
        
        console.log(`Response for ${mode} mode:`);
        console.log(JSON.stringify(response.data, null, 2));
        
        // Verify the mockup URL is accessible
        if (response.data.mockupUrl) {
          try {
            const mockupUrlResponse = await axios.head(response.data.mockupUrl);
            console.log(`Mockup URL is accessible: ${response.data.mockupUrl}`);
            console.log(`Status: ${mockupUrlResponse.status}`);
          } catch (urlError) {
            console.error(`Mockup URL is not accessible: ${response.data.mockupUrl}`);
            console.error(`Error: ${urlError.message}`);
          }
        }
      } catch (modeError) {
        console.error(`Error testing ${mode} mode:`, modeError.message);
      }
    }
    
    console.log('\n==== TEST COMPLETE ====');
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testMockupGeneration();
} else {
  // Export for use in other scripts
  module.exports = { testMockupGeneration };
} 