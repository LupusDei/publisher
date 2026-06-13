import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionBanner } from "@/components/ConnectionBanner";

describe("ConnectionBanner", () => {
  it("should label the live state in text (accessibility)", () => {
    render(<ConnectionBanner connection="live" />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("should label the reconnecting state (state)", () => {
    render(<ConnectionBanner connection="reconnecting" />);
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
  });

  it("should offer a Reconnect button on error and call onReconnect (error handling)", async () => {
    const user = userEvent.setup();
    const onReconnect = vi.fn();
    render(<ConnectionBanner connection="error" onReconnect={onReconnect} />);
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});
