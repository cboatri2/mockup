/**
 * Health check endpoint for the PSD mockup service
 */

module.exports = function(app) {
  app.get('/health', (req, res) => {
    // Log the request for diagnostic purposes
    console.log(`Health check requested from: ${req.headers.origin || 'unknown'}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    // Enable CORS for diagnostic purposes
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Return status information
    res.json({
      status: 'ok',
      service: 'psd-mockup-service',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown',
      templatesDir: process.env.TEMPLATES_DIR || 'not configured',
      uptime: process.uptime() + ' seconds',
      environment: process.env.NODE_ENV || 'development',
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