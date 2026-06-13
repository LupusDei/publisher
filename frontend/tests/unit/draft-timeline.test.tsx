import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DraftAttempt } from "@/app/runs/run-state";
import { DraftTimeline } from "@/components/DraftTimeline";
import { wordDiff, htmlToText } from "@/app/runs/diff";

function draft(
  over: Partial<DraftAttempt> & { attempt: number },
): DraftAttempt {
  return {
    webpage: {
      title: "On Emergence",
      html: `<p>draft ${over.attempt}</p>`,
      css: "",
      summary: "",
      sourcesUsed: [],
    },
    ts: "t",
    ...over,
  };
}

describe("wordDiff", () => {
  it("should tag removed and added tokens between two strings (happy path)", () => {
    const tokens = wordDiff("the casual take", "the measured take");
    const removed = tokens.filter((t) => t.op === "removed").map((t) => t.text);
    const added = tokens.filter((t) => t.op === "added").map((t) => t.text);
    expect(removed).toContain("casual");
    expect(added).toContain("measured");
  });

  it("should return all-equal for identical strings (edge case)", () => {
    const tokens = wordDiff("same words", "same words");
    expect(tokens.every((t) => t.op === "equal")).toBe(true);
  });

  it("htmlToText should strip tags to plain prose", () => {
    expect(htmlToText("<p>hello <b>world</b></p>")).toBe("hello world");
  });
});

describe("DraftTimeline", () => {
  it("should render an empty note when there are no drafts (empty state)", () => {
    render(<DraftTimeline drafts={[]} />);
    expect(screen.getByText(/No drafts yet/)).toBeInTheDocument();
  });

  it("should render each attempt with score and verdict (happy path)", () => {
    render(
      <DraftTimeline
        drafts={[
          draft({ attempt: 1, score: 0.42, passed: false }),
          draft({ attempt: 2, score: 0.81, passed: true }),
        ]}
      />,
    );
    expect(screen.getByText("Attempt 1")).toBeInTheDocument();
    expect(screen.getByText("0.42")).toBeInTheDocument();
    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.getByText("0.81")).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
  });

  it("should show the feedback that produced the next attempt (R2 narrative)", () => {
    render(
      <DraftTimeline
        drafts={[
          draft({
            attempt: 1,
            score: 0.42,
            passed: false,
            feedbackToNext: "Match the persona voiceSample cadence.",
          }),
          draft({ attempt: 2, score: 0.81, passed: true }),
        ]}
      />,
    );
    expect(
      screen.getByText(/Match the persona voiceSample cadence/),
    ).toBeInTheDocument();
  });

  it("should reveal the before/after diff on compare click (state change, R2 money shot)", async () => {
    const user = userEvent.setup();
    render(
      <DraftTimeline
        drafts={[
          draft({
            attempt: 1,
            passed: false,
            webpage: {
              title: "t",
              html: "<p>a casual take</p>",
              css: "",
              summary: "",
              sourcesUsed: [],
            },
          }),
          draft({
            attempt: 2,
            passed: true,
            webpage: {
              title: "t",
              html: "<p>a measured take</p>",
              css: "",
              summary: "",
              sourcesUsed: [],
            },
          }),
        ]}
      />,
    );
    const compareBtn = screen.getByRole("button", {
      name: /Compare attempt 1/,
    });
    await user.click(compareBtn);
    expect(
      screen.getByLabelText(/Diff of attempt 1 versus attempt 2/),
    ).toBeInTheDocument();
    // The diff marks the changed words.
    expect(screen.getByText("casual").tagName.toLowerCase()).toBe("del");
    expect(screen.getByText("measured").tagName.toLowerCase()).toBe("ins");
  });
});
