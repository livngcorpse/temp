# Backend Dockerfile for Quickdrop Core
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy source files
COPY . .

# Expose backend port
EXPOSE 4000

# Use production environment by default
ENV NODE_ENV=production

# Start the backend
CMD ["node", "src/index.js"]
