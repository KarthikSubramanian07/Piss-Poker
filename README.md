# Piss Poker

**Chips on your phone. Cards on the table.** A realtime chip tracker for live home poker: deal real cards, and everyone bets, raises and scoops pots from their own phone.

[![CI](https://github.com/KarthikSubramanian07/Piss-Poker/actions/workflows/ci.yml/badge.svg)](https://github.com/KarthikSubramanian07/Piss-Poker/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-f5db2b)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages%20%2B%20Durable%20Objects-f38020?logo=cloudflare&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)

`poker` `home-game` `chip-tracker` `texas-holdem` `realtime` `websockets` `durable-objects` `cloudflare-pages` `react` `pwa`

**Play it:** [piss-poker.pages.dev](https://piss-poker.pages.dev)

<p>
  <img src="docs/your-turn-light.png" width="240" alt="Your turn: the action bar floods yellow with Fold, Call and Raise" />
  <img src="docs/waiting-dark.png" width="240" alt="Dark mode while waiting: the pot, a Deal the flop prompt and the seat list" />
  <img src="docs/showdown-dark.png" width="240" alt="Showdown: two winners ticked, each share shown before paying out" />
</p>

---

## Why this exists

Somebody always forgets the chips. Somebody else "borrows" a stack. Side pots turn into a group negotiation. So the cards stay physical (shuffling is half the fun) and the chips moved into everyone's pocket.

Before writing a line, we read the code of 22 open source chip trackers and put 9 betting engines through scripted side pot and all-in scenarios. Every tracker had real rule bugs (short all-ins reopening betting, the big blind posted twice when the table shrinks, kicks deleting chips, clients trusted to say who they are), and none of the engines passed every scenario. So this one was built from scratch around a small, heavily tested rules engine and a server that owns the truth.

## What it does

- **One phone per player, zero accounts.** Start a table, share a four-letter code, QR code or link. Names are the only sign up.
- **Real no-limit hold'em rules.** Blinds post themselves, turn order is enforced, and the big blind keeps its option. Minimum raises follow the last full raise, and short all-ins only reopen betting when they add up to a full raise (TDA rule 47).
- **Side pots without arguments.** Pots are built in layers from what each player put in, uncalled chips go back automatically, and folded chips stay in as dead money.
- **Chops take one tap per winner.** Same hand as somebody else? Tap both names. Every pot lists its players with a checkbox, each share appears the moment you pick, and the odd chip goes clockwise from the dealer with a line saying so.
- **Your turn is impossible to miss.** The action bar floods yellow, a soft two-note chime plays, and Android phones buzz. The screen stays awake while a table is open.
- **Deal prompts for the dealer.** "Deal the flop", "Run out the board", "Who won?". The app tells the table what the cards should be doing.
- **Built for real tables.** Anyone can undo, seats can be added for players without a phone, and anyone can act for someone who is away. A phone can hand its seat to a new device (with the table's approval), and dropped connections reconnect by themselves.
- **Settle up.** Buy-ins, rebuys and net results, plus the fewest payments needed to square up in chips or cash.
- **Table display mode.** Prop an iPad or laptop in the middle for a big-type view of the pot, whose turn it is and every stack, with a QR code to join.
- **Phone first, fine everywhere.** Thumb-zone controls on phones, a two-column layout with keyboard shortcuts (`F` fold, `C` check or call, `R` raise, arrows to size, `Enter` to confirm, `N` next hand) on iPad and desktop. Light and dark follow the device setting.

## Architecture

```
 phones, iPads, laptops                    Cloudflare
┌──────────────────────┐   HTTPS   ┌─────────────────────────────────────────────┐
│ React 19 SPA (Vite)  │──────────▶│ Pages: static app + /api/* Pages Function    │
│  shared/engine.ts    │           │                 │ service binding            │
│  (legal moves, UI)   │   WSS     │                 ▼                            │
│                      │◀─────────▶│ Worker "piss-poker-api"                      │
└──────────────────────┘           │  POST /api/rooms         create a table      │
                                   │  GET  /api/rooms/:code   peek at a table     │
                                   │  GET  /api/rooms/:code/ws  WebSocket upgrade │
                                   │                 │ idFromName(code)           │
                                   │                 ▼                            │
                                   │ Durable Object "Room" (one per table)        │
                                   │  shared/engine.ts  (authoritative rules)     │
                                   │  hibernating WebSockets, SQLite storage      │
                                   │  undo history, presence, claims, alarms      │
                                   └─────────────────────────────────────────────┘
```

**The server owns the truth.** Phones send intentions (`act`, `award`, `undo`); the room's Durable Object validates them against the rules engine and broadcasts the new state to everyone. A client cannot move chips, act out of turn or pretend to be someone else.

**Every change is versioned.** Each state carries a version `v`, and every action names the version it was decided on. Double taps, two people pressing "Deal next hand" at once, and actions taken from a stale screen are rejected with `STALE`. The sender gets the fresh state back.

**Identity is a device secret.** Each device generates a random 256-bit token. The room stores only a SHA-256 hash of it (salted with the table code) and never broadcasts it. Taking over a seat from a new device needs approval from someone at the table, unless nobody else is around.

**Undo rewinds the game, not the guest list.** The last 30 game states are kept. Membership lives outside that history, so undoing never removes someone who just sat down or brings back someone who was removed.

**Resilient on real phones.** iOS freezes sockets when a phone locks, so clients ping every 10 seconds (answered by the runtime without waking the object), reconnect on focus, visibility and network changes, and back off with jitter. Rooms hibernate when idle and delete themselves after 12 quiet hours.

### Repository map

| Path | What lives there |
| --- | --- |
| `shared/engine.ts` | Pure betting engine: blinds, turn order, raises, side pots, payouts. No dependencies. |
| `shared/protocol.ts` | Wire message types and strict validation of everything a client sends. |
| `shared/settle.ts` | Ledger, cents conversion that always sums to zero, minimal transfers. |
| `shared/names.ts` | Name cleanup: Unicode normalization, invisible and bidi characters stripped, grapheme limits. |
| `worker/src/room.ts` | The `Room` Durable Object: sockets, permissions, undo, presence, rate limits, expiry. |
| `worker/src/index.ts` | API router, origin allowlist, room creation with per-address rate limiting. |
| `functions/api/[[path]].ts` | Pages Function forwarding `/api/*` to the worker. |
| `functions/_middleware.ts` | Accept negotiation (`text/markdown`), real 404s, SPA rewrite for `/t/*`. |
| `public/` | Trust pages, `llms.txt`, markdown mirrors, `404.html`, SEO assets. |
| `src/` | The React app: screens, the action dock, sheets, table display. |
| `test/` | Engine scenarios, a seeded fuzzer, protocol and settlement tests. |
| `worker/test/` | Durable Object integration tests running inside workerd. |
| `e2e/` | Playwright suite with several simulated devices, plus a screenshot walkthrough. |

## Testing

```bash
npm run test:unit     # engine scenarios + 1,500 fuzzed games + protocol + settle-up
npm run test:worker   # Durable Object and WebSocket protocol inside workerd
npm run test:e2e      # Playwright: full hands across simulated phones, iPad and desktop
FUZZ_GAMES=25000 npm run test:unit   # the long fuzz run
```

- **Scenario tests** cover every rule bug found while auditing other projects:
  - short and cumulative all-ins
  - the big blind on a short stack, and a heads-up small blind all in for less than the big blind
  - the table dropping from three to two players
  - dead money, three-way ties with odd chips
  - leaving on your own turn, and leaving at showdown
- **The fuzzer** plays random games of 2 to 9 players with short, mixed and deep stacks, random leaves and deliberate illegal moves. After every action it checks:
  - chips are conserved
  - somebody legal is always due to act
  - pots add up, eligibility is nested, and each player can win exactly what they matched
  - rejected moves never change state
  - nobody posts the big blind twice in a row

  25,000 games pass clean.
- **Integration tests** cover stale versions, concurrent `next` and `undo`, seat claims, kicks, host handoff, oversized and malformed messages, rate limits and room expiry.
- **End-to-end tests** cover:
  - a complete hand across three phones
  - two players chopping a pot, shares previewed before the payout
  - a real side pot
  - acting for a seat without a phone, plus undo
  - moving a seat to a new device
  - going offline mid-hand
  - desktop keyboard shortcuts
  - no horizontal overflow from 320 to 1440 pixels

## Local development

```bash
npm install
npm run dev          # worker on :8787 and Vite on :5173 with /api proxied
```

Open two browser windows (or a normal and a private window) at `http://localhost:5173` to play against yourself.

Other scripts: `npm run typecheck`, `npm run build`, `npm run shots` (screenshots of every screen in `/tmp/pp-shots`), `npm run assets` (regenerates icons and the OpenGraph image).

## Deployment

Pushes to `main` ship automatically once typecheck, unit, worker and end-to-end tests pass:

1. **Frontend and Pages Function:** the `deploy-web` job calls a Cloudflare Pages deploy hook (repository secret `PAGES_DEPLOY_HOOK`). Pages then builds (`npm run test:unit && npm run build`) and serves `piss-poker.pages.dev`.
2. **API worker:** the `deploy-api` job runs `wrangler deploy`. It needs a `CLOUDFLARE_API_TOKEN` secret with *Workers Scripts: Edit* permission (`CLOUDFLARE_ACCOUNT_ID` is already set). The worker rarely changes, so without the token it is skipped and can be shipped with `npm run deploy:api`.

Manual deploy from a logged-in machine: `npm run deploy`.

## Tech

React 19, Vite 8, TypeScript 5.9, Cloudflare Pages, Workers, Durable Objects (SQLite-backed, WebSocket hibernation), Vitest 4 with `@cloudflare/vitest-pool-workers`, Playwright, Geist and Instrument Serif, `uqr` for QR codes.

## License

[MIT](LICENSE) © Karthik Subramanian
