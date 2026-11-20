# TrendRadar frontend: multi-stage — Vite build + nginx со SPA-роутингом
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

# SPA-роутинг: /explorer, /graph и т.д. отдают index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
