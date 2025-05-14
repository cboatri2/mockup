/**
 * Health check endpoint for the PSD mockup service
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const puppeteer = require('puppeteer-core');

module.exports = function(app) {
  // Standard health check
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
  
  // Test endpoint for Puppeteer browser launch
  app.get('/test-browser', async (req, res) => {
    console.log('=== TEST BROWSER ENDPOINT CALLED ===');
    
    try {
      // Get Chrome executable path from environment variables
      const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
                        process.env.CHROMIUM_PATH || 
                        '/usr/bin/google-chrome-stable';
      
      console.log('[Chrome Path]', chromePath);
      
      // Check if Chrome exists
      const chromeExists = fs.existsSync(chromePath);
      console.log('[Chrome Exists]', chromeExists);
      
      // Configure Puppeteer launch options
      const launchOptions = {
        headless: true,
        executablePath: chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--no-zygote'
        ]
      };
      
      console.log('Launching browser with options:', JSON.stringify(launchOptions, null, 2));
      
      // Try to launch browser
      const browser = await puppeteer.launch(launchOptions);
      console.log('Browser launched successfully!');
      
      // Get browser version
      const version = await browser.version();
      console.log('Browser version:', version);
      
      // Create a new page
      const page = await browser.newPage();
      console.log('Page created successfully!');
      
      // Try navigating to a simple page
      await page.goto('about:blank');
      console.log('Navigation successful!');
      
      // Close the browser
      await browser.close();
      console.log('Browser closed successfully!');
      
      // Send success response
      res.status(200).json({
        status: 'success',
        message: 'Browser launched and closed successfully',
        browser: {
          version: version,
          chromePath: chromePath,
          chromeExists: chromeExists
        }
      });
    } catch (error) {
      console.error('Error in browser test:', error);
      
      // Send error response
      res.status(500).json({
        status: 'error',
        message: 'Browser launch failed',
        error: error.message,
        stack: error.stack
      });
    }
  });
  
  // Handle OPTIONS requests for CORS preflight
  app.options('/health', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
  });
  
  app.options('/test-browser', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
  });
}; 