"use client";

/**
 * ShareLink (publisher-share US2 / share.3.2) — the gallery + run-detail
 * affordance that mints, surfaces, and (US3 / share.4.3) revokes a run's public
 * preview URL.
 *
 * Presentation only: all network logic lives in run-api.ts (Constitution §4).
 * On mount it asks `fetchShare` whether an active share already exists so the UI
 * is idempotent (re-opening a shared run shows the link, no re-mint). With no
 * share it shows a "Get share link" action → `createShare` → the URL with
 * copy-to-clipboard + an Open-in-new-tab link. Copy degrades gracefully when the
 * Clipboard API is unavailable. Styling reuses the shared Atelier `Button`.
 */
import { useEffect, useState } from "react";
import type { ShareLink as ShareLinkData } from "@publisher/shared";
import { createShare, fetchShare, revokeShare } from "@/app/runs/run-api";
import { Button } from "@/components/ui/Button";

export interface ShareLinkProps {
  /** The run to mint/read a share for. */
  runId: string;
  /** API base override (tests inject a stub base; defaults to run-api's base). */
  base?: string | undefined;
}

type CopyState = "idle" | "copied" | "unavailable";

/** Copy text to the clipboard, degrading gracefully when unavailable. */
async function copyToClipboard(text: string): Promise<boolean> {
  const clip = globalThis.navigator?.clipboard;
  if (!clip?.writeText) return false;
  try {
    await clip.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareLink({ runId, base }: ShareLinkProps): React.ReactElement {
  const [link, setLink] = useState<ShareLinkData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copy, setCopy] = useState<CopyState>("idle");

  // Idempotent load: surface an already-active share without minting one.
  useEffect(() => {
    let active = true;
    void (async () => {
      const existing = base
        ? await fetchShare(runId, base)
        : await fetchShare(runId);
      if (active && existing) setLink(existing);
    })();
    return () => {
      active = false;
    };
  }, [runId, base]);

  async function onGet(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const minted = base
        ? await createShare(runId, base)
        : await createShare(runId);
      setLink(minted);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create share link");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy(): Promise<void> {
    if (!link) return;
    const ok = await copyToClipboard(link.url);
    setCopy(ok ? "copied" : "unavailable");
  }

  async function onRevoke(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await (base ? revokeShare(runId, base) : revokeShare(runId));
      // Revoked → drop the link and reset transient copy state so the UI
      // reverts cleanly to the "Get share link" affordance.
      setLink(null);
      setCopy("idle");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke share link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-link" aria-label="Share link">
      {!link && (
        <Button variant="primary" size="md" onClick={onGet} disabled={busy}>
          {busy ? "Getting link…" : "Get share link"}
        </Button>
      )}

      {link && (
        <div className="share-link-active">
          <a
            className="share-link-url"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            {link.url}
          </a>
          <div className="share-link-actions">
            <Button
              variant="quiet"
              size="md"
              onClick={onCopy}
              aria-label="Copy share link"
            >
              Copy
            </Button>
            <a
              className="share-link-open"
              href={link.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open share link in a new tab"
            >
              Open
            </a>
            <Button
              variant="danger"
              size="md"
              onClick={onRevoke}
              disabled={busy}
              aria-label="Revoke link"
            >
              {busy ? "Revoking…" : "Revoke link"}
            </Button>
          </div>
          {copy === "copied" && (
            <span role="status" className="share-link-copied">
              Copied
            </span>
          )}
          {copy === "unavailable" && (
            <span role="status" className="share-link-copied">
              Copy unavailable — select and copy the link manually
            </span>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="form-error share-link-error">
          {error}
        </p>
      )}
    </div>
  );
}
