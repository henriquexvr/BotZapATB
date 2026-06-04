# ATBLoLBot

WhatsApp bot that monitors League of Legends matches and roasts players who lose. Built with Baileys (WhatsApp Web), Riot API, and Google Gemini AI.

## Run

```bash
npm start          # starts bot + health check server on PORT (default 3000)
```

No tests, linter, or formatter are configured. `npm test` is a no-op placeholder.

## Architecture

- `src/index.js` — entry point. WhatsApp connection, message handling, polling loop, Express health check.
- `src/riot.js` — Riot API client. Region hardcoded to `americas`. Tracks LoL queues only: 420 Solo/Duo, 450 ARAM, 440 Flex 5v5, 1900 URF, 1700 Arena. Uses `lol/match/v5/` endpoint. TFT support was removed in 2026-06-04 because the API key lacked scope for the `tft/match/v5/` endpoint.
- `src/gemini.js` — Gemini AI prompts for generating roasts and win rate summaries. Model: `gemini-2.5-flash`. All output is in Portuguese.

Data persistence: `persist/data.json` (player list + last seen match IDs) and `persist/auth_info_baileys/` (WhatsApp session). Path resolved by `getPersistPath()` in `src/index.js`: uses `PERSIST_PATH` env var if set, otherwise defaults to `__dirname/../persist` (i.e. `./persist`).

## Environment Variables

Required in `.env`:
- `RIOT_API_KEY` — Riot Games API key
- `GEMINI_API_KEY` — Google Gemini API key
- `WHATSAPP_TARGET` — group JID for automatic roast messages (e.g. `120363023306628951@g.us`)
- `POLLING_INTERVAL` — ms between match checks (default 600000 = 10 min)

`WHATSAPP_TARGET` must be set or the polling loop silently does nothing.

## WhatsApp Commands

| Command | Description |
|---|---|
| `!player Nick#Tag` | Register a player to monitor. Tag is required (no default). |
| `!roast_ultimo` | Roast everyone who lost their most recent match. |
| `!stats_10` | Show win rate summary for last 10 matches per player. |
| `!meu_id` | Print the current chat/group JID. |

## Gotchas

- `test_riot.js` is a standalone dev script with a hardcoded API key. It is gitignored. Do not run it or commit it.
- `RIOT_API_KEY` in `.env` is gitignored but currently present in the repo. Do not commit `.env`.
- The `tokens/` directory is gitignored and appears unused by the main app.
- `getSummonerRank` silently swallows 403 errors (Riot API key quota). This is intentional.
- Match IDs are compared numerically by splitting on `_` — assumes Riot's `BR1_XXXXXXXXXX` format.
- CommonJS modules (`"type": "commonjs"` in package.json). Do not use ESM syntax.
- Docker uses `node:20` base image. No Chromium needed (Baileys is headless).
