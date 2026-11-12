FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3100 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/xiaoi-runtime.db

COPY services/xiaoi-runtime ./services/xiaoi-runtime
COPY packages/xiaoi-core ./packages/xiaoi-core

WORKDIR /app/services/xiaoi-runtime

RUN mkdir -p /data

EXPOSE 3100

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
