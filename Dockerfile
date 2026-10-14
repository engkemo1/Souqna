FROM node:22-slim
WORKDIR /app
# Litestream: streams the SQLite database to Cloudflare R2 and restores it on start-up (no volume needed).
COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/local/bin/litestream
# CLIP model files are NOT baked in and need no volume: they are pulled from Cloudflare R2 into this temporary folder at start-up.
ENV MODEL_CACHE_DIR=/app/.model-cache
COPY package*.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
RUN sed -i 's/\r$//' /app/server/start.sh /app/server/litestream.yml \
 && chmod +x /app/server/start.sh && cp /app/server/litestream.yml /etc/litestream.yml
RUN npm install && DB_FILE=/app/seed-db/souqna.db MEDIA_DIR=/app/seed-db/media npm run seed && npm run build && npm prune --omit=dev
ENV PORT=10000
EXPOSE 10000
CMD ["/app/server/start.sh"]
