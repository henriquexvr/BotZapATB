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

Data persistence: `persist/data.json` (player list + last seen match IDs + `lastRoastAt[puuid]` for cooldown tracking) and `persist/auth_info_baileys/` (WhatsApp session). Path resolved by `getPersistPath()` in `src/index.js`: uses `PERSIST_PATH` env var if set, otherwise defaults to `__dirname/../persist` (i.e. `./persist`).

## Auto-Roast Behavior

The polling loop auto-sends a **single consolidated BOLETIM DA VERGONHA** to `WHATSAPP_TARGET` per poll cycle, listing every loss detected across all monitored players. A `lastRoastAt[puuid]` timestamp per player enforces a `ROAST_COOLDOWN_MS` window so a player who loses 5 times in 5 minutes still gets at most 1 message. If a transient Riot API error causes `getMatchDetails` to return `null`, `lastMatchId` is **not** updated — the next poll retries the same match.

## Environment Variables

Required in `.env`:
- `RIOT_API_KEY` — Riot Games API key
- `GEMINI_API_KEY` — Google Gemini API key
- `WHATSAPP_TARGET` — group JID for automatic roast messages (e.g. `120363023306628951@g.us`)
- `POLLING_INTERVAL` — ms between match checks (default 600000 = 10 min)
- `ROAST_COOLDOWN_MS` — minimum interval between auto-roasts per player (default 1800000 = 30 min). While in cooldown, new losses are still detected and `lastMatchId` is updated, but no roast is generated.

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
