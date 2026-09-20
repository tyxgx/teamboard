# ---- build stage: full deps + TypeScript compile ----
FROM node:22-slim AS build
WORKDIR /app
# openssl is required by the Prisma engines on slim images
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: prod deps + compiled output only ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
COPY bin ./bin
USER node
EXPOSE 5001
# `npm start` applies pending Prisma migrations, then runs dist/server.js (the file that actually listens).
CMD ["npm", "start"]
