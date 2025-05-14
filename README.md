# PSD Mockup Service

A service for generating product mockups by applying custom designs to PSD templates using Puppeteer and Photopea.

## Features

- Uploads design images and inserts them into PSD templates
- Handles various product mockup templates
- Supports multiple design layer detection strategies
- Provides a simple REST API for integration with e-commerce platforms

## Deployment to Railway with Nixpacks

This service is configured to work with Railway's Nixpacks build system, which ensures all necessary dependencies for Puppeteer and Chromium are properly installed.

### How to Deploy

1. Push your code to a GitHub repository
2. Connect your repository to Railway
3. Railway will automatically detect the Nixpacks configuration
4. Set the following environment variables in Railway:
   - `PORT`: The port for the server (Railway sets this automatically)
   - `PSD_TEMPLATE_URL`: URL to your PSD template
   - `DESIGN_PLACEHOLDER_NAME`: Name of the layer in the PSD where designs should be placed (default: "Design Placeholder")
   - `CORS_ORIGIN`: Allowed origins for CORS (can be comma-separated list or "*")
   - `BASE_URL`: The base URL for serving mockup images (e.g., your Railway deployment URL)

### Updating Deployment

When you push changes to your repository, Railway will automatically rebuild and redeploy the service.

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a config file: `npm run config`
4. Start the development server: `npm run dev`

## API Endpoints

### `POST /render-mockup`

Creates a mockup from a design image.

**Request body:**
```json
{
  "designId": "unique-design-id",
  "sku": "product-sku",
  "imageUrl": "https://example.com/design-image.png",
  "mode": "auto" // Optional: "auto", "photopea", or "psdjs"
}
```

**Response:**
```json
{
  "success": true,
  "mockupUrl": "https://your-service.up.railway.app/mockups/mockup-12345.png",
  "designId": "unique-design-id",
  "sku": "product-sku"
}
```

### `GET /health`

Health check endpoint that returns the service status.

## Technical Details

The service uses multiple approaches to generate mockups:

1. **Photopea (Primary)**: Uses Puppeteer to automate Photopea (web-based Photoshop alternative)
2. **PSD.js (Fallback)**: Uses the PSD.js library for simpler PSD manipulation
3. **Basic Mockup (Final Fallback)**: Generates a simple centered design on a colored background

Nixpacks ensures all necessary system dependencies for Chromium are installed in the Railway environment. 