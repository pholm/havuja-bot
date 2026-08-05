FROM node:24-alpine
WORKDIR /usr/havujabot
COPY package.json .
COPY package-lock.json .
RUN npm ci
COPY . .
RUN npm run build
# npm run start
CMD ["npm", "run", "start"]
