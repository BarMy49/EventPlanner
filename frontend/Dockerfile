FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache certbot gettext

COPY nginx.http.conf.template nginx.https.conf.template /etc/nginx/templates/
COPY docker-entrypoint.sh /usr/local/bin/event-planner-entrypoint
RUN chmod +x /usr/local/bin/event-planner-entrypoint
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
EXPOSE 443

ENTRYPOINT ["/usr/local/bin/event-planner-entrypoint"]
