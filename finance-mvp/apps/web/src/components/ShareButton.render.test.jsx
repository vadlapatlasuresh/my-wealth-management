import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import ShareButton from "./ShareButton";

/*
 * SSR smoke tests for the reusable ShareButton (matches this project's renderToString style;
 * no jsdom). The Web Share behaviour + fallback menu are interactive and covered by manual/e2e;
 * here we assert the button renders in its variants so it can be dropped in anywhere safely.
 */
describe("ShareButton", () => {
  it("renders a labelled secondary button by default", () => {
    const html = renderToString(<ShareButton url="https://app.example.com/invoice/abc" label="Share" />);
    expect(html).toContain("Share");
    expect(html).toContain("ti-share");
    expect(html).toContain("btn");
  });

  it("renders an icon-only button in the icon variant", () => {
    const html = renderToString(
      <ShareButton variant="icon" icon="ti-share" tooltip="Share this invoice" url="https://x" />
    );
    expect(html).toContain("icon-btn");
    expect(html).toContain('title="Share this invoice"');
  });

  it("does not render the fallback menu until opened", () => {
    const html = renderToString(<ShareButton url="https://x" />);
    expect(html).not.toContain('role="menu"');
  });
});
