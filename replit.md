# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

### روز - منصة ألعاب البث (`artifacts/rose-platform`)
- **Type**: React + Vite web app
- **Preview**: `/` (root path)
- **Stack**: React, TypeScript, Tailwind CSS, Framer Motion, Wouter
- **Purpose**: Interactive streaming gaming platform with 3 games:
  - **لعبة الأغاني** (Song Game): Team-based song guessing with host control panel, double points (×2), answer reveal, skip, and manual scoring
  - **لعبة XO** (Tic Tac Toe): Classic XO game between two teams/players with score tracking
  - **عجلة الحرب** (Wheel of War): Luck-based elimination wheel with random shot counts (1-7)
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
