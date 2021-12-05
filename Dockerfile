FROM node:alpine
EXPOSE 3000 9229

WORKDIR /usr/havujabot

COPY package.json .

RUN rm -rf node_modules 

RUN npm install ci

COPY . .

#RUN tsc

CMD ["npm", "start"]