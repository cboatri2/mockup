FROM node:18-slim

WORKDIR /app

# Install dependencies for Chrome
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
    gnupg \
    ca-certificates \
    fonts-freefont-ttf \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    xdg-utils \
    lsb-release

# Install Chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify Chrome installation
RUN google-chrome --version

# Copy package files
COPY package*.json ./
RUN npm install

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV CHROMIUM_PATH=/usr/bin/google-chrome

# Copy application files
COPY . .

# Create directories
RUN mkdir -p /app/temp && chmod 777 /app/temp
RUN mkdir -p /app/assets/templates && chmod 777 /app/assets/templates

# Expose the port
EXPOSE 8080
ENV PORT=8080

# Create startup script
RUN echo '#!/bin/bash\necho "Starting PSD Mockup Service"\necho "Chrome version: $(google-chrome --version)"\necho "Chrome path: $(which google-chrome)"\nnode src/server.js' > /app/start.sh && chmod +x /app/start.sh

# Start the server
CMD ["/app/start.sh"] 