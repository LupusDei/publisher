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
