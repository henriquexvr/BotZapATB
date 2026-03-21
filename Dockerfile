FROM node:20

# Baileys doesn't need Chromium, so we use a simpler image
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Ensure the auth directory exists for persistence
RUN mkdir -p auth_info_baileys

ENV NODE_ENV=production

CMD ["npm", "start"]
