# havuja-bot

A telegram bot for tracking skied distance in a group chat. Based on [tonni-bot](https://github.com/peksi/tonni-bot) by [peksi](https://github.com/peksi).

You might think it's completely overengineered and you'd be right.

## Development

-   Create a Telegram bot using BotFather
-   Create a `.env` file based on the `.env.example` and fill the necessary values.
-   Use Docker Compose to run the bot: `docker compose up --build`

## Production

-   Create a Telegram bot using BotFather
-   Copy the codebase to a service capable of Docker Compose.
-   Create a `.env` file based on the `.env.example` and fill the necessary values. Make sure to set `COMPOSE_FILE=docker-compose-prod.yml`.
-   Start the service with `docker compose -f docker-compose-prod.yml up -d`.
-   Ski
