/**
 * Railway Connection Test Script
 * 
 * This script tests different URL formats to connect to the Railway mockup service
 */
const axios = require('axios');

// Test URLs to try
const testUrls = [
  'https://topperswap-club-production.up.railway.app/health',
  'https://topperswap-club-production.up.railway.app:8080/health',
  'http://topperswap-club-production.up.railway.app/health',
  'http://topperswap-club-production.up.railway.app:8080/health',
  'topperswap-club-production.up.railway.app/health'
];

// Test the mockup endpoint
async function testMockupEndpoint(baseUrl) {
  try {
    console.log(`Testing mockup endpoint: ${baseUrl}/render-mockup`);
    
    const response = await axios.post(`${baseUrl}/render-mockup`, {
      designId: 'test-design-' + Date.now(),
      sku: 'test-sku-123',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ SUCCESS! Mockup endpoint response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return true;
  } catch (error) {
    console.error('❌ ERROR with mockup endpoint:');
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received');
    } else {
      // Something happened in setting up the request
      console.error(`Error: ${error.message}`);
    }
    
    return false;
  }
}

// Test one URL format
async function testUrl(url) {
  try {
    console.log(`Testing URL: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 5000
    });
    
    console.log(`✅ SUCCESS! Status: ${response.status}`);
    console.log(JSON.stringify(response.data, null, 2));
    
    return { success: true, baseUrl: url.replace('/health', '') };
  } catch (error) {
    console.error(`❌ ERROR with ${url}:`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    
    return { success: false };
  }
}

// Run all tests
async function runTests() {
  console.log('=== RAILWAY CONNECTION TEST ===');
  console.log('Testing multiple URL formats...\n');
  
  let successfulUrl = null;
  
  // Test each URL format
  for (const url of testUrls) {
    console.log(`\n--- Testing ${url} ---`);
    
    try {
      const result = await testUrl(url);
      if (result.success) {
        successfulUrl = result.baseUrl;
        // Break on first success
        break;
      }
    } catch (e) {
      console.error('Unexpected error:', e);
    }
    
    console.log('--------------------------\n');
  }
  
  // If we found a working URL, test the mockup endpoint
  if (successfulUrl) {
    console.log(`\n\n=== FOUND WORKING URL: ${successfulUrl} ===`);
    console.log('Now testing mockup endpoint...\n');
    
    await testMockupEndpoint(successfulUrl);
    
    console.log(`\n=== CONNECTION TEST COMPLETE ===`);
    console.log(`Use this URL in your environment: ${successfulUrl}`);
  } else {
    console.log('\n❌ FAILED: Could not connect to Railway service with any URL format');
    console.log('Possible issues:');
    console.log('1. Railway service is not running');
    console.log('2. Railway service is not publicly accessible');
    console.log('3. Network connectivity issues');
    console.log('4. Firewall or security restrictions');
  }
}

// Run the tests
runTests().catch(console.error); 