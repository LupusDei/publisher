import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/app/runs/run-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/runs/run-api")>("@/app/runs/run-api");
  return { ...actual, fetchRuns: vi.fn() };
});

import { fetchRuns } from "@/app/runs/run-api";
import GalleryPage from "@/app/runs/gallery/page";

const mockRuns = vi.mocked(fetchRuns);

function run(id: string, status: string) {
  return {
    id,
    personaId: "p_1",
    concept: `concept ${id}`,
    workerId: "opus",
    status: status as never,
    createdAt: "t",
    updatedAt: "t",
  };
}

describe("GalleryPage", () => {
  it("should show only published runs as gallery cards (happy path)", async () => {
    mockRuns.mockResolvedValue([run("a", "published"), run("b", "failed")]);
    render(<GalleryPage />);
    expect(await screen.findByText("concept a")).toBeInTheDocument();
    expect(screen.queryByText("concept b")).not.toBeInTheDocument();
  });

  it("should show an empty note when nothing is published (empty state)", async () => {
    mockRuns.mockResolvedValue([run("b", "failed")]);
    render(<GalleryPage />);
    expect(await screen.findByText(/No published pages yet/)).toBeInTheDocument();
  });

  it("should surface a load error (error handling)", async () => {
    // mockRejectedValue builds the rejected promise lazily ON CALL, so the
    // page's awaiter attaches its handler in the same microtask — no spurious
    // "unhandled rejection" report (a pre-built rejected promise would race it).
    mockRuns.mockRejectedValue(new Error("gallery down"));
    render(<GalleryPage />);
    expect(await screen.findByText("gallery down")).toBeInTheDocument();
  });
});
