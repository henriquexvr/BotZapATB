FROM node:20

# Baileys doesn't need Chromium, so we use a simpler image
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure the auth directory exists for persistence
RUN mkdir -p auth_info_baileys

RUN addgroup --system botuser && adduser --system --ingroup botuser botuser
RUN chown -R botuser:botuser /app
USER botuser

ENV NODE_ENV=production

CMD ["npm", "start"]
