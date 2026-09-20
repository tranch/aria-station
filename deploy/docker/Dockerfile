FROM node:22.19.0-alpine3.22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci
COPY apps/web apps/web
COPY apps/server apps/server
RUN npm run build
RUN npm prune --omit=dev

FROM node:22.19.0-alpine3.22 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=55290
WORKDIR /app
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=root:root /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=root:root /app/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=root:root /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 55290
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:55290/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
