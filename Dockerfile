FROM node:24-alpine
# Season boundaries are computed in local time; keep them on Finnish time so
# they line up with the cron schedules.
ENV TZ=Europe/Helsinki
WORKDIR /usr/havujabot
COPY package.json .
COPY package-lock.json .
RUN npm ci
COPY . .
RUN npm run build
# npm run start
CMD ["npm", "run", "start"]
