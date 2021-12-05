FROM node:alpine

RUN apk add --no-cache git

WORKDIR /usr/havujabot

COPY package.json .

COPY package-lock.json .

RUN npm ci

COPY . .

RUN npm run build

CMD ["npm", "start"]