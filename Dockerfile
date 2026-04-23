FROM node:25-alpine AS builder

WORKDIR /app

# Build tools needed to compile native modules (better-sqlite3, bcrypt, sharp)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:25-alpine AS production

LABEL org.opencontainers.image.source=https://github.com/iankulin/piksto

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY app.js server.js package.json ./
COPY src/ src/
COPY views/ views/
COPY public/ public/

RUN mkdir -p data

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
