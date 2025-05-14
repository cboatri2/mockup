#!/bin/bash

# Script to update Railway environment variables
# Requires Railway CLI to be installed: https://docs.railway.app/develop/cli

echo "Deploying configuration to Railway..."

# Update environment variables
railway variables set \
  DESIGN_PLACEHOLDER_NAME="Design Placeholder" \
  PSD_TEMPLATE_URL="https://pfyspfutnfnap3ka.public.blob.vercel-storage.com/templates/topper-mockup-front.psd" \
  CORS_ORIGIN="https://topperswap-club.vercel.app,https://topperswap.vercel.app,https://topperswap-club-git-main-cboatri2.vercel.app" \
  DEBUG="true"

# Deploy latest changes
railway up

echo "Deployment complete!" 