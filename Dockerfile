# syntax=docker/dockerfile:1
FROM node:20-slim

WORKDIR /app

# Copy root and workspace package files
COPY package.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm run postinstall

# Copy application source code
COPY . .

# Build frontend production bundle
RUN npm run build

# Expose server port
ENV PORT=5000
ENV NODE_ENV=production
EXPOSE 5000

# Start unified server
CMD ["npm", "start"]
