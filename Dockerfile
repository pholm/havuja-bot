FROM node:24-alpine
# Season boundaries are computed in local time; keep them on Finnish time so
# they line up with the cron schedules.
ENV TZ=Europe/Helsinki
WORKDIR /usr/havujabot
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
CMD ["pnpm", "run", "start"]
