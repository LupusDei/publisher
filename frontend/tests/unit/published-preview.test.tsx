import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Receipt } from "@publisher/shared";
import {
  PublishedPreview,
  RefusedToPublish,
} from "@/components/PublishedPreview";

const receipt: Receipt = {
  id: "run_1",
  url: "/published/run_1",
  bytes: 4096,
  publishedAt: "2026-06-13T12:00:00.000Z",
  workerId: "opus",
};

describe("PublishedPreview", () => {
  it("should iframe the published page and show receipt details (happy path)", () => {
    render(<PublishedPreview receipt={receipt} base="http://api.test" />);
    const frame = screen.getByTitle(/Published page for run_1/);
    expect(frame).toHaveAttribute("src", "http://api.test/published/run_1");
    expect(screen.getByText("opus")).toBeInTheDocument();
    expect(screen.getByText("4,096 bytes")).toBeInTheDocument();
  });
});

describe("RefusedToPublish", () => {
  it("should render the designed refusal screen with the reason (terminal failure)", () => {
    render(
      <RefusedToPublish reason="Quality gate failed on all 3 attempts." />,
    );
    expect(screen.getByText("Refused to publish")).toBeInTheDocument();
    expect(
      screen.getByText(/Quality gate failed on all 3 attempts/),
    ).toBeInTheDocument();
  });
});
