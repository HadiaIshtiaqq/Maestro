FROM node:20-slim
WORKDIR /app

# Separate dep install for Docker layer caching
COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .
# VITE_* are baked into the frontend bundle at build time (client-side keys).
ARG VITE_GOOGLE_MAPS_API_KEY=""
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
# Build BOTH the web UI (vite) and the server (esbuild) so the deployed
# service serves the operator dashboard, not just the API.
RUN npm run build

# Cloud Run injects PORT at runtime (default 8080)
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/server.cjs"]
