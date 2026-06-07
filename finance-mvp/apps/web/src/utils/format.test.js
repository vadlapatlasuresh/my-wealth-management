import { describe, it, expect } from "vitest";
import { currency, pct, greeting, formatDate } from "./format";

describe("currency", () => {
  it("formats USD", () => {
    expect(currency(1234.5)).toBe("$1,234.50");
  });
  it("renders negatives with a minus sign", () => {
    expect(currency(-1038)).toBe("-$1,038.00");
  });
  it("treats null/undefined as 0", () => {
    expect(currency(null)).toBe("$0.00");
    expect(currency(undefined)).toBe("$0.00");
  });
});

describe("pct", () => {
  it("renders a fraction as a 1-decimal percentage", () => {
    expect(pct(0.1234)).toBe("12.3%");
  });
});

describe("greeting", () => {
  it("varies by time of day", () => {
    expect(greeting(new Date(2026, 0, 1, 9, 0))).toBe("Good morning");
    expect(greeting(new Date(2026, 0, 1, 14, 0))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 0, 1, 20, 0))).toBe("Good evening");
  });
});

describe("formatDate", () => {
  it("returns an em dash for empty input", () => {
    expect(formatDate("")).toBe("—");
    expect(formatDate(null)).toBe("—");
  });
});
