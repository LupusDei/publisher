/**
 * Published preview + receipt (dp0.9.4) and the terminal-failure screen. On
 * success it iframes the published page and shows the receipt details. On a
 * terminal failure it renders a designed "refused to publish — here's why"
 * screen, because the harness declining to ship a bad page is itself a feature
 * worth showing.
 */
import type { Receipt } from "@publisher/shared";
import { publishedUrl } from "@/app/runs/run-api.js";

export interface PublishedPreviewProps {
  receipt: Receipt;
  /** API base so a relative receipt URL resolves to the serving backend. */
  base?: string;
}

export function PublishedPreview({
  receipt,
  base,
}: PublishedPreviewProps): React.ReactElement {
  const url = publishedUrl(receipt, base);
  return (
    <section className="published-preview" aria-labelledby="published-h">
      <h3 id="published-h">Published page</h3>
      <iframe
        title={`Published page for ${receipt.id}`}
        src={url}
        className="published-frame"
      />
      <dl className="receipt">
        <div>
          <dt>URL</dt>
          <dd>
            <a href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          </dd>
        </div>
        <div>
          <dt>Worker</dt>
          <dd>{receipt.workerId}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{receipt.bytes.toLocaleString()} bytes</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>{receipt.publishedAt}</dd>
        </div>
      </dl>
    </section>
  );
}

export interface RefusedToPublishProps {
  reason: string;
}

/** The terminal-failure screen — the harness refusing to ship a failing page. */
export function RefusedToPublish({
  reason,
}: RefusedToPublishProps): React.ReactElement {
  return (
    <section className="refused" role="alert" aria-labelledby="refused-h">
      <h3 id="refused-h">Refused to publish</h3>
      <p className="refused-lead">
        The harness will not ship a page that fails its own gates. Here is why:
      </p>
      <p className="refused-reason">{reason}</p>
      <p className="refused-note">
        This is the harness working as designed — a failed run that fails{" "}
        <em>loudly and legibly</em> beats a bad page shipped quietly.
      </p>
    </section>
  );
}
