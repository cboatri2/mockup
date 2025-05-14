/**
 * Utility for downloading files from URLs
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Constants
const TEMP_DIR = path.join(__dirname, '..', 'temp');

/**
 * Downloads a file from a URL to a local path
 * 
 * @param {string} url - The URL of the file to download
 * @param {string} outputPath - The local path to save the file
 * @returns {Promise<string>} - The path to the downloaded file
 */
async function downloadFile(url, outputPath) {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Download the file
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    // Save the file
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error);
    throw error;
  }
}

/**
 * Downloads a design image from a URL
 * 
 * @param {string} imageUrl - The URL of the image to download
 * @param {string} designDir - The ID of the design (used for folder naming)
 * @returns {Promise<string>} - The path to the downloaded image
 */
async function downloadDesignImage(imageUrl, designDir) {
  // Create a descriptive filename based on the URL
  const urlObj = new URL(imageUrl);
  const extension = path.extname(urlObj.pathname) || '.png';
  const filename = `design-image${extension}`;
  
  // Get the design directory or create it from design ID if it's just a string
  const outputDir = typeof designDir === 'string' && !designDir.includes('/') && !designDir.includes('\\')
    ? path.join(TEMP_DIR, designDir)
    : designDir;
  
  // Ensure the temp directory exists
  fs.mkdirSync(outputDir, { recursive: true });
  
  const outputPath = path.join(outputDir, filename);
  
  // Log attempt
  console.log(`Attempting to download image from ${imageUrl} to ${outputPath}`);
  
  try {
    // Download the image
    const maxRetries = 3;
    let attempt = 1;
    let lastError = null;
    
    while (attempt <= maxRetries) {
      try {
        console.log(`Download attempt ${attempt}/${maxRetries}...`);
        await downloadFile(imageUrl, outputPath);
        console.log(`✅ Successfully downloaded image to ${outputPath}`);
        return outputPath;
      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        attempt++;
        
        if (attempt <= maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error('Failed to download image after multiple attempts');
  } catch (error) {
    console.error(`Failed to download design image: ${error.message}`);
    throw error;
  }
}

/**
 * Cleans up temporary files
 * 
 * @param {string|string[]} filePaths - The file paths to remove
 * @returns {Promise<void>}
 */
async function cleanupFiles(filePaths) {
  if (!filePaths) return;
  
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up temporary file: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error cleaning up file ${filePath}:`, error.message);
      // Continue with other files even if one fails
    }
  }
}

module.exports = {
  downloadFile,
  downloadDesignImage,
  cleanupFiles
};
