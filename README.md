# havuja-bot

A telegram bot for tracking skied distance in a group chat. Based on [tonni-bot](https://github.com/peksi/tonni-bot) by [peksi](https://github.com/peksi).

You might think it's completely overengineered and you'd be right.

## Development

-   Create a Telegram bot using BotFather
-   Create a `.env` file based on the `.env.example` and fill the necessary values.
-   Use Docker Compose to run the bot: `docker compose up --build`

Requires Node 24+ outside Docker. `npm run dev` runs the TypeScript sources
directly via Node's built-in type stripping — no transpiler needed. `npm run
build` emits `dist/`, and `npm run typecheck` checks types without emitting.

## Tests

The suite drives the real bot with synthetic Telegram updates against a real
Postgres, with the Telegram API and the chart service faked. It needs a
throwaway database:

```
npm run test:db:up
npm test
npm run test:db:down
```

Settings live in `test/test.env`. Test files run one at a time because they
share the database.

## Production

-   Create a Telegram bot using BotFather
-   Copy the codebase to a service capable of Docker Compose.
-   Create a `.env` file based on the `.env.example` and fill the necessary values. Make sure to set `COMPOSE_FILE=docker-compose-prod.yml`.
-   Start the service with `docker compose -f docker-compose-prod.yml up -d`.
-   Ski
