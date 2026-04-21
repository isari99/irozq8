# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

### روز - منصة ألعاب البث (`artifacts/rose-platform`)
- **Type**: React + Vite web app
- **Preview**: `/` (root path)
- **Stack**: React, TypeScript, Tailwind CSS, Framer Motion, Wouter
- **Purpose**: Interactive streaming gaming platform with 9 games:
  - **لعبة الأغاني** (Song Game): Team-based song guessing with host control panel
  - **لعبة XO** (Tic Tac Toe): Classic XO game via Twitch chat
  - **عجلة الشخصنة** (Wheel Game): Luck-based elimination via Twitch chat
  - **لعبة الأسئلة** (Quiz Game): Twitch chat quiz with teams
  - **حرب الفواكه** (Fruits Game): Vote-based elimination via Twitch chat
  - **برا السالفة** (Imposter Game): Web multiplayer, rooms via WS, word deduction
  - **السلم والثعبان** (Snakes Game): Twitch chat board game
  - **الكراسي الموسيقية** (Chairs Game): Musical chairs via Twitch chat with spinning wheel
  - **أقنعني** (Convince Game): Web multiplayer, players write answers + rate each other 1-10, first to target score wins
  - **UNO** (Uno Game): Full online UNO card game, 2-10 players, WebSocket multiplayer, all special cards + chat + leaderboard + avatar system (8 characters, encoded as `avatarId:name`) + bot support (0-3 bots, 3 difficulty levels) + hologram avatar display
- **Design**: Dark purple/neon theme (pink #e040fb + cyan #00e5ff), Arabic RTL UI, Cairo font, Framer Motion animations
- **Logo**: `public/rose-logo.png` (cyberpunk character)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
