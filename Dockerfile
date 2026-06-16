FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend ci

COPY . .
RUN npm --prefix frontend run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/frontend/package*.json ./frontend/
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/server.js ./frontend/server.js
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules

EXPOSE 3000

CMD ["node", "/app/server.js"]
