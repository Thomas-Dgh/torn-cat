FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY api/relay/package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY api/relay/ .

# Copy the scripts directory
COPY scripts/ ./scripts/

# Expose port
EXPOSE 3002

# Start the application
CMD ["node", "server.js"]