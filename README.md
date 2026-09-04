# Waifu Catcher Telegram Mini App

A mobile-first Telegram Mini App (Web App) and Express backend API for collecting, trading, and managing anime waifu cards.

## Features

- **Telegram WebApp Integration & Sync**: Seamless authentication using `initData` HMAC-SHA256 verification, automatic profile synchronization (`username`, `first_name`, `last_name`, `photo_url`), and start parameter handling for referrals.
- **Gacha Card Catching & Summoning**: Roll for waifu cards across multiple rarities (Common, Rare, Epic, Legendary) with cooldown timers and power stats.
- **Marketplace & Card Packs**: Buy card packs or list/trade waifu cards with other players using in-game coins or gems.
- **Daily Tasks & Login Streaks**: Earn rewards by keeping up login streaks and completing daily tasks.
- **Referral System**: Invite friends via Telegram share links and claim bonus coins and gems.
- **Achievements & Leaderboards**: Track top collectors, wealthiest players, and highest levels.
- **Developer / Admin Control Panel**: In-app administrative tools for role management, user resource updates, and granting card collectibles.

## Environment Variables

Copy `.env.example` to create your local `.env` configuration:

```bash
cp .env.example .env
```

Available environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `BOT_TOKEN` | Telegram Bot Token obtained from BotFather | `MOCK_BOT_TOKEN_FOR_DEV_AND_TESTS` |
| `BOT_USERNAME` | Telegram Bot Username for referral invite links | `WaifuCatcherBot` |
| `DB_PATH` | Path to SQLite database file | `./waifu_catcher.db` |

## Telegram User Synchronization (`initData`)

When launched inside Telegram, the WebApp automatically sends the `Telegram.WebApp.initData` payload in the `X-Telegram-Init-Data` header.

The backend authentication middleware (`authMiddleware` in `server.js` and `validateAndParseInitData` in `auth.js`):
1. Verifies the SHA-256 HMAC signature using your `BOT_TOKEN`.
2. Parses the authenticated Telegram user details (`id`, `username`, `first_name`, `last_name`, `photo_url`).
3. Automatically creates a new database user record if logging in for the first time or updates the profile fields if changes occurred in Telegram.
4. Handles referral parameter (`start_param=ref_<userId>`) automatically upon registration.

## Getting Started

### Installation

To install dependencies:
```
npm install
```

### Running the Server

To start the server:
```
node server.js
```

The application will run on `http://localhost:3000`.

### Running Tests

To run test suite:
```
npm test
```

## License

ISC
