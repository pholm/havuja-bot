FROM node:alpine

RUN apk add --no-cache git

WORKDIR /usr/havujabot

COPY package.json .

COPY package-lock.json .

RUN npm i
# RUN npm ci

COPY . .


## this is for production
### should probably have own dockerfile for production
## RUN npm run build

CMD ["npm", "run", "dev"]