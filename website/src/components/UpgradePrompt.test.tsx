// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UpgradePrompt from "./UpgradePrompt";

afterEach(() => cleanup());

describe("<UpgradePrompt />", () => {
  it("renders the default title + message when open", () => {
    render(<UpgradePrompt open onClose={() => {}} />);
    expect(screen.getByText(/Upgrade to continue/i)).toBeTruthy();
    expect(screen.getByText(/paid Wallplace plan/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /See plans/i })).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<UpgradePrompt open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("calls onClose when 'Not now' is clicked", async () => {
    const onClose = vi.fn();
    render(<UpgradePrompt open onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Not now/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("respects custom upgrade url", () => {
    render(
      <UpgradePrompt
        open
        onClose={() => {}}
        upgradeUrl="/custom/billing"
      />,
    );
    const link = screen.getByRole("link", { name: /See plans/i });
    expect(link.getAttribute("href")).toBe("/custom/billing");
  });
});
