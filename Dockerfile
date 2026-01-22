# --- Stage 1: Build Frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

# Copy package files and install dependencies
# Note: Ensure you have package.json and package-lock.json in your energy-sensemaker folder
COPY energy-sensemaker/package*.json ./
RUN npm install

# Copy source and build
COPY energy-sensemaker/ ./
RUN npm run build

# --- Stage 2: Final Image (Python Backend) ---
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies required for scientific libraries (like 'arch' and 'scikit-learn')
RUN apt-get update && apt-get install -y \
    build-essential \
    libatlas-base-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
# Note: Ensure you have a requirements.txt in your backend folder
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ ./backend

# Copy the built frontend assets to the backend static directory
# This allows FastAPI to serve the React app
COPY --from=frontend-builder /app/frontend/dist ./static

# Expose the port FastAPI runs on
EXPOSE 8000

# Environment variables (Can also be provided at runtime via -e)
ENV PYTHONUNBUFFERED=1

# Run the application
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]