# PSD Mockup Service

A dedicated service for generating product mockups from PSD templates. This service was built for Topperswap to handle PSD processing outside the main Next.js application.

## Features

- 🖼️ PSD template processing using PSD.js
- 🎨 Advanced mockup generation via Puppeteer + Photopea
- 📦 Fallback to basic mockups when templates aren't available
- 🌐 RESTful API with CORS support
- 🔄 Configurable processing modes
- 🖼️ PNG template support for simpler templates

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/psd-mockup-service.git
   cd psd-mockup-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a configuration file:
   ```bash
   npm run config
   ```
   This will copy `env.example` to `.env`. Edit this file to configure your deployment.

## Usage

### Starting the Service

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### API Endpoints

#### Health Check
```
GET /health
```
Returns service status and version information.

#### CORS Test
```
GET /cors-test
```
Tests CORS configuration.

#### Render Mockup
```
POST /render-mockup
```

Request body:
```json
{
  "designId": "design-123",
  "sku": "product-456",
  "imageUrl": "https://example.com/design.png",
  "mode": "auto"
}
```

Parameters:
- `designId`: Unique identifier for the design
- `sku`: Product SKU (used to find the correct template)
- `imageUrl`: URL to the design image
- `mode`: Processing mode
  - `auto`: Try PSD.js first, fall back to Photopea if needed (default)
  - `psdjs`: Use only PSD.js for processing
  - `photopea`: Use only Photopea for processing

Response:
```json
{
  "success": true,
  "mockupUrl": "http://localhost:3000/mockups/mockup-123456789.png",
  "designId": "design-123",
  "sku": "product-456",
  "processingDetails": {
    "templateFound": true,
    "templateType": "png",
    "methodUsed": "png",
    "fallbackUsed": false
  }
}
```

### Templates

The service supports the following template types:
- PSD files for complex templates with layering and effects
- PNG files for simpler templates
- Fallback to basic mockups when no templates are available

Templates should be placed in the `/assets/templates` directory with the following naming convention:
- For specific SKUs: `{sku}.psd` or `{sku}.png`
- Default templates: `default.psd` or `default.png`

### Testing

Run all tests:
```bash
npm test
```

Create test templates:
```bash
npm run create-templates
```

Test mockup generation:
```bash
npm run test-mockup
```

Test just the image processor without the server:
```bash
node local-image-test.js
```

Clean temporary files:
```bash
npm run clean
```

## Deployment

### Railway Deployment Guide

1. Create a new Railway project:
   - Go to [Railway.app](https://railway.app/) and sign in
   - Click "New Project" and select "Deploy from GitHub"
   - Select your repository

2. Configure environment variables:
   - Go to your project settings
   - Add the following variables:
     - `PORT`: 3000 (Railway will automatically assign a port, but this will be the internal port)
     - `NODE_ENV`: production
     - `BASE_URL`: Your Railway app URL (e.g., https://your-app-name.railway.app)
     - `PUBLIC_PATH`: /mockups

3. Add storage:
   - Railway apps use ephemeral storage, so for production, consider adding a persistent storage solution
   - You can use Railway's PostgreSQL plugin or connect to S3/other object storage

### Integration with Next.js

In your Next.js application, you'll need to create API routes to interact with the mockup service:

1. Create an API file (e.g., `pages/api/generate-mockup.js`):

```javascript
// pages/api/generate-mockup.js
import axios from 'axios';

const MOCKUP_SERVICE_URL = process.env.MOCKUP_SERVICE_URL || 'https://your-mockup-service-url.railway.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { designId, sku, imageUrl } = req.body;
    
    if (!designId || !sku || !imageUrl) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Call the mockup service
    const response = await axios.post(`${MOCKUP_SERVICE_URL}/render-mockup`, {
      designId,
      sku,
      imageUrl,
      mode: 'auto'
    });
    
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error generating mockup:', error);
    return res.status(500).json({ 
      error: 'Error generating mockup', 
      details: error.message 
    });
  }
}
```

2. Update your Next.js component to call this API:

```javascript
// Example component
import { useState } from 'react';
import axios from 'axios';

export default function DesignDetails({ design, sku }) {
  const [mockupUrl, setMockupUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const generateMockup = async () => {
    try {
      setLoading(true);
      const response = await axios.post('/api/generate-mockup', {
        designId: design.id,
        sku,
        imageUrl: design.imageUrl
      });
      
      if (response.data.success) {
        setMockupUrl(response.data.mockupUrl);
      } else {
        console.error('Mockup generation failed:', response.data.error);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <h2>{design.name}</h2>
      <button onClick={generateMockup} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Mockup'}
      </button>
      
      {mockupUrl && (
        <div>
          <h3>Mockup</h3>
          <img src={mockupUrl} alt="Product Mockup" />
        </div>
      )}
    </div>
  );
}
```

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure the mockup service has CORS properly configured to allow requests from your frontend domain.

2. **Connection Issues**: If the frontend can't connect to the mockup service, verify:
   - The service is running and accessible from the internet
   - The URL is correct and includes the protocol (https://)
   - There are no firewall issues

3. **Template Issues**: If mockups don't look right, check:
   - Templates exist for the requested SKU
   - Template layer structure is correct (PSD files should have a "Design" layer)
   - The design image is properly formatted

4. **Performance Issues**: PSD processing can be resource-intensive. Consider:
   - Using PNG templates for simple mockups
   - Adjusting the Railway instance type for more resources
   - Adding caching for frequently accessed mockups

## License

ISC 