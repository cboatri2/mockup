FROM node:18-slim

# Install dependencies and Chrome browser
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    gnupg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome directly from Google
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Set environment variables to prevent Puppeteer from downloading Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true 
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV CHROMIUM_PATH=/usr/bin/google-chrome-stable
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV NODE_ENV=production

# Create directories
RUN mkdir -p /app/temp && chmod 777 /app/temp
RUN mkdir -p /app/assets/templates && chmod 777 /app/assets/templates

# Copy package files
COPY package.json ./

# Install dependencies without running Puppeteer's install script
RUN npm install --production --no-optional --ignore-scripts \
    && npm install --save puppeteer-core@21.9.0

# Copy app files
COPY . .

# Expose port
EXPOSE 8080
ENV PORT=8080

# Start server
CMD ["node", "src/server.js"] 