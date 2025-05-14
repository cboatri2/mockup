/**
 * Create a simple test PNG template
 * This script creates a simple template image for testing
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Ensure directories exist
const TEMPLATES_DIR = path.join(__dirname, 'assets', 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  console.log(`Created templates directory: ${TEMPLATES_DIR}`);
}

/**
 * Create a simple template image
 * 
 * @param {string} outputPath - Where to save the template
 * @param {object} options - Template options
 * @returns {Promise<string>} - Path to the created template
 */
async function createTemplateImage(outputPath, options = {}) {
  const {
    width = 800,
    height = 800,
    background = { r: 255, g: 255, b: 255, alpha: 1 }
  } = options;

  try {
    console.log(`Creating template image at ${outputPath}...`);
    
    // Create a simple 800x800 white image with a colored rectangle
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background
      }
    })
    // Add a placeholder rectangle for the design
    .composite([
      {
        input: Buffer.from(`
          <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect x="50" y="50" width="700" height="700" fill="#f5f5f5" stroke="#cccccc" stroke-width="2"/>
            <text x="400" y="400" font-family="Arial" font-size="24" fill="#999999" text-anchor="middle">Design</text>
          </svg>
        `),
        top: 0,
        left: 0
      }
    ])
    .toFile(outputPath);
    
    console.log(`Template image created at ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(`Error creating template image: ${error.message}`);
    throw error;
  }
}

// Create test template images
async function createTestTemplates() {
  try {
    // Create default.png template
    const defaultTemplatePath = path.join(TEMPLATES_DIR, 'default.png');
    if (!fs.existsSync(defaultTemplatePath)) {
      await createTemplateImage(defaultTemplatePath);
    } else {
      console.log(`Default template already exists at ${defaultTemplatePath}`);
    }
    
    // Create test-sku-456.png template (with a different background color)
    const skuTemplatePath = path.join(TEMPLATES_DIR, 'test-sku-456.png');
    if (!fs.existsSync(skuTemplatePath)) {
      await createTemplateImage(skuTemplatePath, {
        background: { r: 240, g: 240, b: 250, alpha: 1 }
      });
    } else {
      console.log(`SKU template already exists at ${skuTemplatePath}`);
    }
    
    console.log('Test templates created successfully.');
  } catch (error) {
    console.error('Error creating test templates:', error);
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  createTestTemplates();
} else {
  // Export for use in other scripts
  module.exports = { createTestTemplates };
} 