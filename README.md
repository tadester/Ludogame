# Ludo

Phone-first Classic and Nigerian Ludo built with Next.js and Supabase.

## Requirements

- Node.js 20.19 or newer
- npm
- Docker-compatible container runtime

## Setup

1. Run `npm install`.
2. Run `npm run db:start`.
3. Copy `.env.example` to `.env.local`.
4. Replace the publishable key with the value from `npm run db:status`.
5. Run `npm run dev`.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
