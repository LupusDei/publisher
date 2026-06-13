"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { HealthChip } from "@/components/home/HealthChip";
import "./home.css";

/** The capability beats — what the harness does, revealed in sequence. */
const BEATS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Persona voice",
    body: "Author a persona once; every word is written in their voice, not a template's.",
  },
  {
    title: "Live guardrails",
    body: "The harness watches as the agent works, holding each draft to your standards.",
  },
  {
    title: "Self-correcting drafts",
    body: "When research falls short, the agent re-researches and revises before you ever see it.",
  },
  {
    title: "Final sign-off",
    body: "Nothing publishes without you. The finished page waits for your approval.",
  },
];

export default function HomePage(): React.ReactElement {
  return (
    <main className="home-main">
      <section className="home-hero stagger" aria-labelledby="home-headline">
        <p className="eyebrow" style={{ ["--i" as string]: 0 }}>
          Gauntlet AI · Harness
        </p>

        <hr className="home-rule draw-rule" aria-hidden="true" />

        <h1
          id="home-headline"
          className="home-headline"
          style={{ ["--i" as string]: 1 }}
        >
          Publish beautiful ideas in your own voice.
        </h1>

        <p className="lead home-lead" style={{ ["--i" as string]: 2 }}>
          Turn a research concept into a persona-voiced, beautiful single-page
          site — built by an agent, governed by a harness.
        </p>

        <div className="home-actions" style={{ ["--i" as string]: 3 }}>
          <Link href="/onboarding" className={buttonClass("primary", "lg")}>
            Author your persona →
          </Link>
          <Link href="/runs/demo" className="home-secondary">
            See it run <span className="home-arrow">→</span>
          </Link>
        </div>

        <ul
          className="home-beats stagger"
          aria-label="What the harness does"
          style={{ ["--i" as string]: 4 }}
        >
          {BEATS.map((beat, i) => (
            <li
              key={beat.title}
              className="home-beat"
              style={{ ["--i" as string]: i + 5 }}
            >
              <span className="home-beat-index" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="home-beat-title">{beat.title}</h2>
              <p className="home-beat-body">{beat.body}</p>
            </li>
          ))}
        </ul>

        <div style={{ ["--i" as string]: 8 }}>
          <HealthChip />
        </div>
      </section>
    </main>
  );
}
