# GMDiscordBot

[![License](https://img.shields.io/github/license/gaming-multiverse-community/GMDiscordBot)](LICENSE)

GMDiscordBot is a Discord bot developed for the Gaming Multiverse Community. It provides random welcome messages for new users that join the discord and an advanced yet simple ticket system.

## Support

If you have any questions or need help, feel free to open an issue on GitHub or join our community on [Discord](https://discord.gg/ERmEPsafmR).

## Features

- **Welcome Messages**: Send a random catchy message once a user joins the discord.
- **Ticket System**: An advanded yet simple ticketing system with logs using sqlite3.

## Installation

### Prerequisites

- **Node.js**: Ensure Node.js is installed. [Download Node.js](https://nodejs.org/)
- **Discord Bot Token**: Obtain a bot token from the [Discord Developer Portal](https://discord.com/developers/applications).

### Setup

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/gaming-multiverse-community/GMDiscordBot.git
   cd GMDiscordBot
   ```

2. **Install Dependencies**:

   ```bash
   npm install
   ```

3. **Configuration**:

   - Raname the `.env.example` to `.env` and replace the required missing fields:
     ```plaintext
      DISCORD_TOKEN=Bot_Token_Here
      CLIENT_ID=Application_Id_Here
      GUILD_ID=Guild_Id_Here

      DB_HOST=localhost
      DB_PORT=3306
      DB_USER=your_db_user
      DB_PASSWORD=your_db_password
      DB_NAME=gmbot
     ```
   - Also edit the `config.json` to customize the bot.

4. **Run the Bot**:

   ```bash
   npm start
   ```

   The bot will connect to your Discord server and do its thing.

## Contributing

We welcome contributions from the community. To contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes and commit them (`git commit -m 'Add feature'`).
4. Push to the branch (`git push origin feature-branch`).
5. Open a pull request.

Please ensure your code follows our coding standards and passes all tests.

## License

This project is licensed under the GPL-3.0 License. See the [LICENSE](LICENSE) file for more details.
