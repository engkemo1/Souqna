FROM node:22-slim
WORKDIR /app
# CLIP model files are NOT baked in and need no volume: they are pulled from Cloudflare R2 into this temporary folder at start-up.
ENV MODEL_CACHE_DIR=/app/.model-cache
COPY package*.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
RUN npm install && npm run seed && npm run build && npm prune --omit=dev
ENV PORT=10000
EXPOSE 10000
CMD ["npm", "run", "boot", "-w", "server"]
