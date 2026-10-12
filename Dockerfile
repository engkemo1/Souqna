FROM node:22-slim
WORKDIR /app
COPY package*.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
RUN npm install && npm run seed && npm run build && npm prune --omit=dev
ENV PORT=10000
EXPOSE 10000
CMD ["npm", "run", "boot", "-w", "server"]
