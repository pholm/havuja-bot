# havuja-bot

A telegram bot for tracking skied distance in a group chat. Based on [tonni-bot](https://github.com/peksi/tonni-bot) by [peksi](https://github.com/peksi).

You might think it's completely overengineered and you'd be right.

## Seasons

A season runs from whenever it is opened until 09:00 on the next 1st of May.
Bets and kilometres belong to a season, so nothing carries over and the bot no
longer needs its deadline edited every year.

- `/avaakausi` opens a season. Restricted to the ids in `ADMIN_USER_IDS`,
  which defaults to the atk-jaosto list in `src/env.ts`. To find someone's
  numeric id, have them message [@userinfobot](https://t.me/userinfobot).
- At 09:00 on the 1st of May the bot posts the final standings and closes the
  season. If it happens to be down that morning it does this on its next start
  instead, so the recap is never skipped.
- Between seasons `/latua` and `/betti` are refused. `/stats` and `/analyysi`
  keep reporting the season that just finished.

Season boundaries are computed in local time, so the container pins
`TZ=Europe/Helsinki`.

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
