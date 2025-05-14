# Mockup Service Integration Examples

This directory contains examples for integrating the PSD Mockup Service with your frontend application.

## Next.js Integration

### API Route

The `next-js-api-route.js` file demonstrates how to create an API route in your Next.js application to proxy requests to the mockup service. This provides several benefits:

1. Security - Your frontend doesn't need to directly access the mockup service
2. Centralized configuration - The mockup service URL is configured in one place
3. Error handling - You can add custom error handling logic
4. Environment-specific configuration - Different environments can use different service URLs

To use this example:

1. Create a file in your Next.js project at `pages/api/mockups/generate.js`
2. Copy the content from `next-js-api-route.js` into that file
3. Configure the `MOCKUP_SERVICE_URL` environment variable in your Next.js app

### Component

The `next-js-component.jsx` file shows how to create a React component that calls the API route and displays mockups. Features include:

1. Loading state management
2. Error handling
3. Responsive UI
4. Next.js Image component for optimized image loading

To use this example:

1. Create a component file in your Next.js project
2. Copy the content from `next-js-component.jsx` into that file
3. Import and use the component in your pages

## Environment Variables

### Next.js App

Set these environment variables in your Next.js application:

```
MOCKUP_SERVICE_URL=https://your-mockup-service-url.railway.app
```

### Mockup Service

Set these environment variables in the mockup service:

```
PORT=3000
NODE_ENV=production
BASE_URL=https://your-mockup-service-url.railway.app
PUBLIC_PATH=/mockups
```

## Deployment Flow

1. Deploy mockup service to Railway
2. Configure environment variables in both applications
3. Test the integration using the health check endpoint
4. Deploy your frontend application
5. Verify the end-to-end flow 