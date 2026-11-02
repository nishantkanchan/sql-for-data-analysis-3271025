# syntax=docker/dockerfile:1
# Build from the shloka-setu/ root so content/data can be copied into the image:
#   docker build -f server/Dockerfile -t shloka-setu-api .
#   docker run -p 8080:8080 -e ANTHROPIC_API_KEY=sk-ant-... shloka-setu-api

FROM node:22-slim AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    CONTENT_DIR=/app/content/data \
    CONTENT_RELOAD_SECONDS=0
WORKDIR /app/server
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY server/package.json ./
# Corpus, translations, glossary, syllabus: baked into the image (read-only at runtime).
COPY content/data /app/content/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
