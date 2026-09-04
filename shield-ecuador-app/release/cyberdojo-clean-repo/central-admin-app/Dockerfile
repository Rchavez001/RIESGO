FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY tpotService.js ./
COPY index.html ./
COPY styles.css ./
COPY app.js ./
COPY cyber-sensei.png ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
