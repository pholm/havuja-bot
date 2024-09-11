# havuja-bot

A telegram bot for tracking skied distance in a group chat. Based on [tonni-bot](https://github.com/peksi/tonni-bot) by [peksi](https://github.com/peksi).

## Dev

-   create a telegram bot using BotFather
-   add .env file and fill BOT_TOKEN with right info
-   use Docker Compose to run the bot (currently set up for production, see Dockerfile)

## Production

-   Some of the stuff in `docker-compose.yaml` and `Dockerfile` is currently set up for development, with production versions commented out. Need to figure out how to have two different versions.
