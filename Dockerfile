FROM node:alpine
EXPOSE 3000 9229

RUN apk add --no-cache bash git openssh

WORKDIR /usr/havujabot

COPY package.json .

COPY package-lock.json .

RUN npm ci

COPY . .

RUN npm run build

CMD ["npm", "start"]