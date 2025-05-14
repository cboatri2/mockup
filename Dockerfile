FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxss1 \
    libgtk-3-0 \
    libxshmfence1 \
    libglu1 \
    fonts-freefont-ttf \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    ca-certificates \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify Chromium installation
RUN which chromium || echo "Chromium not found"
RUN ls -la /usr/bin/chromium* || echo "No Chromium binaries found in /usr/bin/"

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Copy application files
COPY . .

# Create temp directory for mockups
RUN mkdir -p /app/temp && chmod 777 /app/temp
RUN mkdir -p /app/assets/templates && chmod 777 /app/assets/templates

# Expose the port
EXPOSE 8080
ENV PORT=8080

# Create startup script
RUN echo '#!/bin/bash\necho "Starting PSD Mockup Service"\necho "Chromium path: $(which chromium)"\nnode src/server.js' > /app/start.sh && chmod +x /app/start.sh

# Start the server
CMD ["/app/start.sh"] 