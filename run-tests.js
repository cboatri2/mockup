/**
 * Comprehensive test script for PSD Mockup Service
 * This runs all tests in sequence to verify service functionality
 */
const { createTestTemplates } = require('./create-test-template');
const { testMockupGeneration } = require('./test-mockup');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const TEMP_DIR = path.join(__dirname, 'temp');
const TEMPLATES_DIR = path.join(__dirname, 'assets', 'templates');
const SERVER_STARTUP_WAIT = 5000; // ms to wait for server to start

// Ensure test directories exist
function ensureDirectories() {
  console.log('\n=== Setting up test environment ===');
  
  [TEMP_DIR, TEMPLATES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}

// Start the mockup service server
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Starting PSD Mockup Service ===');
    
    // Start the server as a child process
    const serverProcess = spawn('node', ['src/server.js'], {
      stdio: 'inherit',
      detached: true
    });
    
    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });
    
    // Give the server some time to start up
    setTimeout(() => {
      console.log(`Server started with PID: ${serverProcess.pid}`);
      resolve(serverProcess);
    }, SERVER_STARTUP_WAIT);
  });
}

// Run all tests
async function runAllTests() {
  console.log('========================================');
  console.log('   PSD MOCKUP SERVICE COMPREHENSIVE TEST');
  console.log('========================================');
  
  let serverProcess = null;
  
  try {
    // Setup
    ensureDirectories();
    
    // Create test PSD templates
    console.log('\n=== Creating test PSD templates ===');
    await createTestTemplates();
    
    // Start server
    serverProcess = await startServer();
    
    // Run mockup generation tests
    await testMockupGeneration();
    
    console.log('\n========================================');
    console.log('           ALL TESTS COMPLETE');
    console.log('========================================');
  } catch (error) {
    console.error('Test suite error:', error);
  } finally {
    // Cleanup - kill server process if it was started
    if (serverProcess) {
      console.log(`\n=== Stopping server (PID: ${serverProcess.pid}) ===`);
      process.kill(-serverProcess.pid, 'SIGINT'); // Kill process group
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
} 