/**
 * This script tests PSD layer structure and accessibility
 * Run with: node test-layer-names.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PSD = require('psd');

// PSD template URL
const PSD_TEMPLATE_URL = 'https://pfyspfutnfnap3ka.public.blob.vercel-storage.com/templates/topper-mockup-front.psd';
const TEMP_FILE = path.join(__dirname, 'test-template.psd');

// Layer names to try
const LAYER_NAMES = [
  "Design Placeholder",
  "Design", 
  "YOUR DESIGN",
  "YOUR DESIGN HERE",
  "DESIGN",
  "DESIGN HERE",
  "place-design",
  "design-placeholder"
];

async function downloadPSD() {
  try {
    console.log(`Downloading PSD from ${PSD_TEMPLATE_URL}...`);
    const response = await axios.get(PSD_TEMPLATE_URL, { 
      responseType: 'arraybuffer',
      timeout: 15000
    });
    
    fs.writeFileSync(TEMP_FILE, response.data);
    console.log(`PSD downloaded successfully: ${TEMP_FILE} (${response.data.length} bytes)`);
    return true;
  } catch (error) {
    console.error('Error downloading PSD:', error.message);
    return false;
  }
}

async function analyzePSD() {
  try {
    console.log('\nAnalyzing PSD structure...');
    const psd = await PSD.open(TEMP_FILE);
    const tree = psd.tree();
    
    // Print basic PSD information
    console.log(`\nPSD Information:`);
    console.log(`- Width: ${psd.header.width}`);
    console.log(`- Height: ${psd.header.height}`);
    console.log(`- Channels: ${psd.header.channels}`);
    console.log(`- Mode: ${psd.header.mode}`);
    console.log(`- Layer count: ${psd.layers.length}`);
    
    // Print the layer structure
    console.log('\nLayer Structure:');
    printLayerStructure(tree, 0);
    
    // Test layer access with different names
    console.log('\nTesting layer access with different names:');
    for (const layerName of LAYER_NAMES) {
      const layer = findLayerByName(tree, layerName);
      if (layer) {
        console.log(`✅ Layer "${layerName}" found!`);
        console.log(`   - Visible: ${layer.visible()}`);
        console.log(`   - Opacity: ${layer.opacity()}`);
        const { top, left, bottom, right } = layer.coords;
        console.log(`   - Dimensions: ${right-left}x${bottom-top} (at ${left},${top})`);
      } else {
        console.log(`❌ Layer "${layerName}" not found`);
      }
    }
    
    // Additional debugging info
    console.log('\nAll layer names (flattened):');
    const allLayers = [];
    flattenLayers(tree, allLayers);
    allLayers.forEach(layer => {
      console.log(`- "${layer.name}" (${layer.type})`);
    });
    
    return true;
  } catch (error) {
    console.error('Error analyzing PSD:', error);
    return false;
  }
}

// Helper to print the layer structure as a tree
function printLayerStructure(node, depth) {
  const prefix = '  '.repeat(depth);
  console.log(`${prefix}- ${node.name} [${node.type}]`);
  
  if (node.children) {
    node.children.forEach(child => {
      printLayerStructure(child, depth + 1);
    });
  }
}

// Helper to find a layer by name (case insensitive)
function findLayerByName(node, name) {
  if (node.name && node.name.toLowerCase() === name.toLowerCase()) {
    return node;
  }
  
  if (node.children) {
    for (const child of node.children) {
      const found = findLayerByName(child, name);
      if (found) return found;
    }
  }
  
  return null;
}

// Helper to flatten all layers into a single array
function flattenLayers(node, result) {
  if (node.type !== 'group') {
    result.push(node);
  }
  
  if (node.children) {
    node.children.forEach(child => {
      flattenLayers(child, result);
    });
  }
}

// Main execution
async function main() {
  const downloadSuccess = await downloadPSD();
  if (!downloadSuccess) {
    console.error('Failed to download PSD, aborting analysis');
    return;
  }
  
  await analyzePSD();
  
  // Cleanup
  try {
    fs.unlinkSync(TEMP_FILE);
    console.log('\nCleanup: Temporary PSD file deleted');
  } catch (error) {
    console.error('Error deleting temporary file:', error.message);
  }
}

main(); 