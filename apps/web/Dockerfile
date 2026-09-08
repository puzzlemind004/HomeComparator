# syntax=docker/dockerfile:1

# --- Étape de build ---------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Étape d'exécution ------------------------------------------------------
FROM nginx:1.27-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web/browser /usr/share/nginx/html

EXPOSE 80
