FROM ghcr.io/puppeteer/puppeteer:21.9.0

USER root
WORKDIR /app

# Install additional fonts
RUN apt-get update && apt-get install -y \
    fonts-freefont-ttf \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV CHROMIUM_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production

# Verify Chrome installation
RUN which google-chrome-stable
RUN google-chrome-stable --version

# Copy application files
COPY . .

# Create directories
RUN mkdir -p /app/temp && chmod 777 /app/temp
RUN mkdir -p /app/assets/templates && chmod 777 /app/assets/templates

# Expose the port
EXPOSE 8080
ENV PORT=8080

# Create startup script
RUN echo '#!/bin/bash\necho "Starting PSD Mockup Service"\necho "Chrome version: $(google-chrome-stable --version)"\necho "Chrome path: $(which google-chrome-stable)"\nexec node src/server.js' > /app/start.sh && chmod +x /app/start.sh

# Start the server
CMD ["/app/start.sh"] 