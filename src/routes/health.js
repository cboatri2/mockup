/**
 * Health check endpoint for the PSD mockup service
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

module.exports = function(app) {
  app.get('/health', (req, res) => {
    // Log the request for diagnostic purposes
    console.log(`Health check requested from: ${req.headers.origin || 'unknown'}`);
    
    // Check if running on Railway
    const isRailway = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_SERVICE_NAME || false;
    
    // Check for Chrome/Chromium
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '/usr/bin/google-chrome-stable';
    let chromeExists = false;
    
    try {
      chromeExists = fs.existsSync(chromePath);
    } catch (error) {
      console.error(`Error checking Chrome path: ${error.message}`);
    }
    
    // Check Chrome version
    let chromeVersion = 'unknown';
    try {
      if (chromeExists) {
        exec(`${chromePath} --version`, (error, stdout, stderr) => {
          if (!error) {
            chromeVersion = stdout.trim();
          }
        });
      }
    } catch (error) {
      console.error(`Error checking Chrome version: ${error.message}`);
    }
    
    // Check system information
    const systemInfo = {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / (1024 * 1024)) + 'MB',
      freeMemory: Math.round(os.freemem() / (1024 * 1024)) + 'MB',
      loadAvg: os.loadavg()
    };
    
    // Check directories
    const templatesDir = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'assets', 'templates');
    const tempDir = process.env.TEMP_DIR || path.join(process.cwd(), 'temp');
    
    const dirInfo = {
      templatesExists: fs.existsSync(templatesDir),
      tempExists: fs.existsSync(tempDir)
    };
    
    // Enable CORS for diagnostic purposes
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Return status information - always return 200 OK for Railway health checks
    res.status(200).json({
      status: 'ok',
      service: 'psd-mockup-service',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      railway: {
        enabled: !!isRailway,
        staticUrl: process.env.RAILWAY_STATIC_URL || null,
        serviceName: process.env.RAILWAY_SERVICE_NAME || null
      },
      browser: {
        path: chromePath,
        exists: chromeExists,
        version: chromeVersion
      },
      system: systemInfo,
      directories: dirInfo,
      uptime: Math.floor(process.uptime()) + ' seconds',
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage()
    });
  });
  
  // Handle OPTIONS requests for CORS preflight
  app.options('/health', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
  });
}; 