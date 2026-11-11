FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["npm", "start"]
