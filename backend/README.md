# @publisher/backend

Layered Express backend: `routes → services → stores`. Contracts come from
`@publisher/shared`; the SQLite schema lives in `migrations/` behind store
interfaces.

## Common commands

```bash
npm run dev   --workspace backend   # tsx watch, boots the server
npm run build --workspace backend   # tsc -> dist/
npm test      --workspace backend   # vitest
npm run smoke --workspace backend   # walking-skeleton integration gate
```

## Seeding demo personas

Two voice-distinct, real personas (`The Essayist`, `The Builder`) back the
demo's "same concept → two visibly different pages" proof (ASSUMPTIONS D14, R6)
and carry real `voiceSample`s for the voice-fidelity checkpoint. Seed them with:

```bash
npm run seed --workspace backend
# or, with an explicit DB:
DATABASE_PATH=./publisher.db npx tsx backend/scripts/seed-personas.ts
```

The seed is **idempotent** — personas are keyed by their unique name, so a
second run inserts nothing. The reusable, unit-tested `seedPersonas(store)`
function lives in `scripts/seed-personas.ts`.

## Authentication (Epic 85q)

Bearer-token auth (HS256, `AUTH_JWT_SECRET`). `POST /auth/register` and
`POST /auth/login` return `{ token, user }`; clients send `Authorization:
Bearer <token>` on every call. `GET /auth/me` returns the current user;
`POST /auth/logout` is a stateless 200 (the client discards the token).
Personas and runs are **owner-scoped**: each is stamped with its creator and a
user only sees their own (an `admin` sees all). See `src/auth/middleware.ts`
(`requireAuth`, `requireAdmin`).

### Seeding an admin

The admin can see every persona/run. Bootstrap one from the environment:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-me \
  npm run seed:admin --workspace backend
# or, with an explicit DB:
ADMIN_EMAIL=... ADMIN_PASSWORD=... DATABASE_PATH=./publisher.db \
  npx tsx backend/scripts/seed-admin.ts
```

Idempotent — keyed by email; re-running with an existing `ADMIN_EMAIL` leaves
that account untouched (it does not reset the password). The reusable,
unit-tested `seedAdmin(store, creds)` function lives in `scripts/seed-admin.ts`.
