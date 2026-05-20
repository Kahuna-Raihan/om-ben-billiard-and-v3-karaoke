# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install backend deps
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy source
COPY backend ./backend
COPY frontend ./frontend

EXPOSE 3001

# Ensure server finds frontend assets
ENV NODE_ENV=production

CMD ["npm", "start", "--prefix", "backend"]

