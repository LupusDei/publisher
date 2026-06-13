# Publishing & Sharing a Preview URL

> Epic `publisher-share` — spec: `../specs/008-publish-share-url/spec.md`

When a concept passes research, the approval gate, and every guardrail and the
user approves it ("prove it"), the run reaches **`status = "published"`** and its
self-contained HTML page lands in the gallery. From there the owner can mint a
**public, unguessable, revocable Preview URL** that anyone — logged in or not —
can open in a browser.

A *share* is a distinct concept from `run.status = "published"`: publishing into
the gallery is not the same as exposing the page publicly. A run has **at most
one active share** at a time.

## The lifecycle

| Step | Request | Result |
| --- | --- | --- |
| Mint | `POST /runs/:id/share` (owner, run `published`) | `200 { slug, url }` |
| Serve | `GET /p/:slug` (no auth) | `200 text/html` — the run's page |
| Revoke | `DELETE /runs/:id/share` (owner) | `204` |
| After revoke | `GET /p/:slug` | `404` |

- **Mint is idempotent** — a second `POST` on a run with an active share returns
  the existing `{ slug, url }`, not a new one.
- **`url`** is `${PUBLIC_BASE_URL}/p/${slug}` when `PUBLIC_BASE_URL` is set, or a
  relative `/p/${slug}` when it is unset (local dev).
- **Errors:** mint a run you do not own → `403`; mint a non-`published` run →
  `409`; an unknown, malformed, **or revoked** slug → a uniform `404` (no oracle
  distinguishing revoked from never-existed).
- **Revoke is idempotent** — revoking a run with no active share is a `204`
  no-op, not an error.

## The slug is unguessable and revocable

The slug is **crypto-strong randomness** (18 random bytes → a 24-char
`base64url` token over the `[A-Za-z0-9_-]` alphabet, ~144 bits of entropy). It is
**never** the internal `runId`, so probing `/p/:slug` reveals nothing about which
runs exist. The slug shape (`/^[A-Za-z0-9_-]{16,}$/`) is enforced at three layers:
the generator (`backend/src/util/slug.ts`), the public route's pre-lookup gate,
and the `ShareSchema` contract (`shared/src/contracts/share.ts`).

Access is revoked by the owner at any time; there is **no TTL/expiry** — revoke is
the only deactivation. Once revoked, the public route `404`s within the same
request cycle.

## Exposing `/p/:slug` publicly with `PUBLIC_BASE_URL`

The generated page is already a self-contained HTML file on disk, served through
the backend's `Sink`. Making it **publicly reachable** is an operational concern,
handled entirely by the `PUBLIC_BASE_URL` env var — it is NOT application code.
There is no ngrok automation and no object storage in this epic; the `Sink` seam
keeps an object-storage backend (S3/R2) a future drop-in swap.

### Local dev — expose via an ngrok tunnel

1. Start the backend (default port `3001`):

   ```bash
   npm run dev --workspace backend
   ```

2. In a second terminal, open an ngrok tunnel to that port:

   ```bash
   ngrok http 3001
   ```

   ngrok prints a public HTTPS forwarding URL, e.g.
   `https://random-subdomain.ngrok-free.app`.

3. Point `PUBLIC_BASE_URL` at that HTTPS URL and restart the backend so minted
   share URLs are absolute and externally clickable:

   ```bash
   PUBLIC_BASE_URL=https://random-subdomain.ngrok-free.app \
     npm run dev --workspace backend
   ```

   Now `POST /runs/:id/share` returns
   `https://random-subdomain.ngrok-free.app/p/<slug>`, which anyone can open.

   > Leave `PUBLIC_BASE_URL` unset and minted URLs are relative (`/p/<slug>`) —
   > fine for same-origin testing, but not externally shareable.

### Production — point at the real domain

Set `PUBLIC_BASE_URL` to the deployed backend's public origin, e.g.:

```bash
PUBLIC_BASE_URL=https://api.yourdomain.com
```

Minted share URLs are then `https://api.yourdomain.com/p/<slug>`. No tunnel is
involved; the domain's TLS-terminating proxy forwards to the backend.
