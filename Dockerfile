FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
# Litestream: streams the SQLite database to Cloudflare R2 and restores it on start-up (no volume needed).
COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/local/bin/litestream
# CLIP model files are NOT baked in and need no volume: they are pulled from Cloudflare R2 into this temporary folder at start-up.
ENV MODEL_CACHE_DIR=/app/.model-cache
# Background-removal model (ISNet general-use, Apache-2.0, ~180 MB) baked into its OWN early layer:
# downloaded once, then reused from the build cache by every later build, so photos never wait for it after a deploy.
# If GitHub is unreachable the build still succeeds and the server downloads the model itself on first use.
ENV BG_MODEL_FILE=/app/models/isnet-general-use.onnx
RUN mkdir -p /app/models && node -e "const fs=require('fs'),c=require('crypto');fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx').then(async r=>{if(!r.ok)throw new Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());const h=c.createHash('sha256').update(b).digest('hex');if(h!=='60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a')throw new Error('checksum '+h);fs.writeFileSync(process.env.BG_MODEL_FILE,b);console.log('[build] background model ready')}).catch(e=>{console.error('[build] background model skipped:',e.message);process.exit(0)})"
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
