FROM node:20-slim
WORKDIR /app

# Separate dep install for Docker layer caching
COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .
RUN npm run build:server

# Cloud Run injects PORT at runtime (default 8080)
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/server.cjs"]
