/**
 * Utility for downloading files from URLs
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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
 * @param {string} imageUrl - The URL of the design image
 * @param {string} designId - The design ID for file naming
 * @returns {Promise<string>} - The path to the downloaded image
 */
async function downloadDesignImage(imageUrl, designId) {
  const tempDir = path.join(__dirname, '..', 'temp');
  const fileExt = path.extname(new URL(imageUrl).pathname) || '.png';
  const outputPath = path.join(tempDir, `design-${designId}${fileExt}`);
  
  return await downloadFile(imageUrl, outputPath);
}

/**
 * Clean up temporary files
 * 
 * @param {string[]} filePaths - Array of file paths to delete
 */
function cleanupFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Error cleaning up file ${filePath}:`, error);
    }
  }
}

module.exports = {
  downloadFile,
  downloadDesignImage,
  cleanupFiles
};
