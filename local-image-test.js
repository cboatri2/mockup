/**
 * Standalone test script for PSD Mockup Service image processing
 * This script directly tests the image processor with PNG templates
 */
const fs = require('fs');
const path = require('path');
const { downloadDesignImage } = require('./src/downloader');
const imageProcessor = require('./src/image-processor');

// Test configuration
const TEST_IMAGE_URL = 'https://placehold.co/400x400/FFFF00/000000.png';
const TEST_DESIGN_ID = 'test-design-123';
const TEST_SKU = 'test-sku-456';

// Ensure directories exist
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const TEMPLATES_DIR = path.join(__dirname, 'assets', 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

// Test function
async function testImageProcessor() {
  console.log('==== MOCKUP IMAGE PROCESSOR TEST ====');
  
  try {
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
    
    // Test basic mockup generation (without any template)
    console.log('\n=== Testing basic mockup generation ===');
    const basicMockupPath = await imageProcessor.generateBasicMockup(
      designImagePath,
      `${TEST_SKU} mockup`
    );
    console.log(`Basic mockup generated at: ${basicMockupPath}`);
    console.log(`File exists: ${fs.existsSync(basicMockupPath)}`);
    
    // Get PNG template paths
    const skuTemplatePath = path.join(TEMPLATES_DIR, `${TEST_SKU}.png`);
    const defaultTemplatePath = path.join(TEMPLATES_DIR, 'default.png');
    
    // Test PNG template mockup generation
    if (fs.existsSync(skuTemplatePath)) {
      console.log('\n=== Testing PNG template mockup generation (SKU-specific) ===');
      const pngMockupPath = await imageProcessor.generateMockupWithPngTemplate(
        skuTemplatePath,
        designImagePath
      );
      console.log(`PNG mockup generated at: ${pngMockupPath}`);
      console.log(`File exists: ${fs.existsSync(pngMockupPath)}`);
    } else if (fs.existsSync(defaultTemplatePath)) {
      console.log('\n=== Testing PNG template mockup generation (default) ===');
      const pngMockupPath = await imageProcessor.generateMockupWithPngTemplate(
        defaultTemplatePath,
        designImagePath
      );
      console.log(`PNG mockup generated at: ${pngMockupPath}`);
      console.log(`File exists: ${fs.existsSync(pngMockupPath)}`);
    } else {
      console.log('\n=== No PNG templates found to test ===');
    }
    
    // Test with the main generateMockup function which should detect template type
    console.log('\n=== Testing auto template detection ===');
    const mockupPath = await imageProcessor.generateMockup({
      templatePath: fs.existsSync(skuTemplatePath) ? skuTemplatePath : 
                    fs.existsSync(defaultTemplatePath) ? defaultTemplatePath : null,
      designImagePath,
      designId: TEST_DESIGN_ID,
      sku: TEST_SKU,
      mode: 'auto'
    });
    console.log(`Auto-detected mockup generated at: ${mockupPath}`);
    console.log(`File exists: ${fs.existsSync(mockupPath)}`);
    
    console.log('\n==== TEST COMPLETE ====');
    console.log('All mockups generated successfully!');
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run the test
testImageProcessor().catch(console.error); 