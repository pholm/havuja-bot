FROM node:alpine
RUN apk add --no-cache git
WORKDIR /usr/havujabot
COPY package.json .
COPY package-lock.json .
RUN npm ci
COPY . .
RUN npm run build
# npm run start
CMD ["npm", "run", "start"]