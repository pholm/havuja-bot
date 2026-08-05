FROM node:26-alpine
# Season boundaries are computed in local time; keep them on Finnish time so
# they line up with the cron schedules.
ENV TZ=Europe/Helsinki
WORKDIR /usr/havujabot
# node:26-alpine no longer ships corepack, so install it to pick up the pnpm
# version pinned by package.json's packageManager field.
RUN npm i -g corepack@latest
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
CMD ["pnpm", "run", "start"]
