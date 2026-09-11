# Whot! Online

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

The server owns the game. Clients send actions and receive a redacted view, so a player only ever sees their own hand. The engine is pure and deterministic given an RNG, which is what the tests use.

## House rules

- 54 cards: circle and triangle 1-14, cross and square 1-14 (no 4, 6, 8, 12), star 1-8, five Whots.
- 1 Hold On (play again), 2 Pick Two, 5 Pick Three, 8 Suspension, 14 General Market, 20 Whot (ask for a shape).
- Picks can be defended with the same number and passed on, if the table allows it.
- Call last card at two cards or fewer. Forget and anyone can catch you for two penalty cards.
- Empty your hand to check up. Leftover cards score against you: stars double, Whot 20.
- Market empty and nothing to reshuffle: lowest hand wins the round.
- Reach the target score and you are out. Last player standing wins the match.
