# syntax=docker/dockerfile:1

# --- Étape de build ---------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node ace build

# --- Étape d'exécution ------------------------------------------------------
FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./

# L'entrypoint joue les migrations avant de démarrer : `docker compose up`
# ne doit demander aucune intervention manuelle.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3333
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "bin/server.js"]
