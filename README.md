# Last Card

Play Whot, the Nigerian card game, online at [lastcard.fun](https://lastcard.fun).

Multiplayer Whot: create a table, share the link, play with friends or bots. No signup.

## Running it

```bash
npm install
npm run dev        # app + game server on http://localhost:5173
```

The dev server hosts the WebSocket game server too, so one command runs everything. `npm run dev -- --host` is already on, so a phone on the same Wi-Fi can join at the LAN address Vite prints.

```bash
npm run build      # typecheck, build the client, bundle the server
npm start          # serve dist/ and the game server on PORT (default 3000)
npm test           # engine and server tests
npm run lint
```

## Two builds

```bash
npm run build          # dist/       the online game: rooms, links, 3D spectators
npm run build:portal   # dist-portal/ solo against bots, no server at all
npm run build:android  # android/LastCard-debug.apk  the solo build as an Android app
```

HTML5 game portals (GameDistribution, Poki, CrazyGames and friends) host static files and will not run a backend, so the portal build drops the socket and runs the game in the browser instead. [localTable.ts](src/net/localTable.ts) speaks the same message protocol as the server, so the interface cannot tell which one it is talking to, and both use the same engine and the same bots: the rules cannot drift apart.

The portal build uses relative asset paths, leaves the address bar alone (it runs in someone else's iframe) and hides everything that needs a server: room codes, invites, watch links. `?solo=1` turns the same mode on in a normal build for testing.

## Deploying to Railway

[railway.json](railway.json) holds the whole setup: build with `npm run build`, start with `npm start`, health check on `/healthz`. Railway supplies `PORT`; no other environment variables are needed.

1. In Railway, create a project from this GitHub repo on `main`.
2. Generate a `*.up.railway.app` domain and play a round there before touching DNS.
3. Under the service's networking settings, add `lastcard.fun` and `www.lastcard.fun` as custom domains. Railway shows the DNS records to create.
4. Add those records at your DNS provider. A bare domain like `lastcard.fun` needs CNAME flattening or an ALIAS record; if the registrar can't do that, move DNS to Cloudflare (free) and leave the records **DNS only**, so Railway issues the HTTPS certificate itself.

Keep it at **one replica**. Rooms live in that process's memory, so a second instance would split tables between machines, and every deploy ends the games in progress. Deploy when the tables are quiet.

## How it fits together

| Path | What it does |
| --- | --- |
| [src/types/game.ts](src/types/game.ts) | Cards, settings, views, the `canPlayCard` rule |
| [src/engine/gameEngine.ts](src/engine/gameEngine.ts) | Pure rules engine: deal, play, draw, score, end rounds |
| [src/engine/bot.ts](src/engine/bot.ts) | Bot move choice per difficulty |
| [server/rooms.ts](server/rooms.ts) | Rooms, seats, turn timers, bot scheduling, reconnects |
| [server/attach.ts](server/attach.ts) | WebSocket layer, rate limiting, heartbeats |
| [src/net/protocol.ts](src/net/protocol.ts) | Message types shared by client and server, with validation |
| [src/store/gameStore.ts](src/store/gameStore.ts) | Client state and the socket connection |
| [src/net/localTable.ts](src/net/localTable.ts) | The same game with no server, for the portal build |
| [src/components/watch/](src/components/watch/) | Spectator screen and the Three.js table |

The server owns the game. Clients send actions and receive a redacted view, so a player only ever sees their own hand. The engine is pure and deterministic given an RNG, which is what the tests use.

## Watching

Every room has a second link, `/w/CODE`, which the host can copy from the lobby or the game header. It opens a 3D table: orbit, spin, or drop into any player's seat, with cards flying from the seat that played them and a running commentary feed.

Spectators have no seat. The server never sends them a hand, only counts, so the redaction is enforced server-side rather than hidden in the interface. They can cheer, at the whole table or at one player, and those cheers appear for the players and float above the table in 3D. Anything else they send is refused.

The Three.js bundle is loaded only when a watch link is opened, so players never download it. Without WebGL the page falls back to a flat view with the same commentary.

## House rules

- 54 cards: circle and triangle 1-14, cross and square 1-14 (no 4, 6, 8, 12), star 1-8, five Whots.
- 1 Hold On (play again), 2 Pick Two, 5 Pick Three, 8 Suspension, 14 General Market, 20 Whot (ask for a shape).
- Picks can be defended with the same number and passed on, if the table allows it.
- Call last card at two cards or fewer. Forget and anyone can catch you for two penalty cards.
- Empty your hand to check up. Leftover cards score against you: stars double, Whot 20.
- Market empty and nothing to reshuffle: lowest hand wins the round.
- Reach the target score and you are out. Last player standing wins the match.
