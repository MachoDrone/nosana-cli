FROM node:22.23.4 as base
WORKDIR /app
COPY . .
RUN npm ci
CMD ["npm", "run", "dev"]