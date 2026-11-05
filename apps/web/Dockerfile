# Not verified in this session (Docker build was not run). See docs/ai/FEATURE_MATRIX.md.
FROM node:22-alpine AS build
WORKDIR /w
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /w/dist /usr/share/nginx/html
EXPOSE 8080
