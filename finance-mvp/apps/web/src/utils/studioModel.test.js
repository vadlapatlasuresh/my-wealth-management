import { describe, it, expect } from "vitest";
import { SECTIONS, SCREENS, renderScreen, renderBlock, esc } from "./studioModel";

describe("studioModel — single source of truth", () => {
  it("every screen references a known section", () => {
    for (const [id, s] of Object.entries(SCREENS)) {
      expect(SECTIONS[s.section], `screen ${id} section`).toBeTruthy();
      expect(Array.isArray(s.blocks)).toBe(true);
      expect(s.name).toBeTruthy();
    }
  });

  it("includes the four Phase-4 screens flagged NEW", () => {
    for (const id of ["yearinreview", "billtiming", "investinsights", "creditscore"]) {
      expect(SCREENS[id], id).toBeTruthy();
      expect(SCREENS[id].isNew).toBe(true);
    }
  });
});

describe("renderScreen / renderBlock — shared by all 3 device panels", () => {
  it("renders every screen to a non-empty string without throwing", () => {
    for (const [id, s] of Object.entries(SCREENS)) {
      const html = renderScreen(s);
      expect(html.length, id).toBeGreaterThan(20);
      expect(html.startsWith("<div class=\"viz-sc\">"), id).toBe(true);
    }
  });

  it("renders real values into the output (deterministic)", () => {
    const html = renderScreen(SCREENS.yearinreview);
    expect(html).toContain("$89,455");       // KPI value
    expect(html).toContain("Your year in money"); // header
    expect(html).toContain("Amazon");        // list row
  });

  it("supports each block type", () => {
    expect(renderBlock({ type: "header", title: "H", subtitle: "S" })).toContain("H");
    expect(renderBlock({ type: "kpis", items: [{ l: "A", v: "1" }] })).toContain("viz-kpi");
    expect(renderBlock({ type: "donut", title: "D", total: "$1", segments: [{ label: "x", value: 5, color: "#000" }] })).toContain("<svg");
    expect(renderBlock({ type: "ring", pct: 0.5, label: "r" })).toContain("50%");
    expect(renderBlock({ type: "gauge", score: 742, min: 300, max: 850 })).toContain("742");
    expect(renderBlock({ type: "bars", title: "B", series: [{ label: "x", value: 5, color: "#000" }] })).toContain("viz-barsc");
    expect(renderBlock({ type: "stacked", title: "S", legend: [], periods: [{ label: "x", segs: [{ v: 1, c: "#000" }] }] })).toContain("viz-barsc");
    expect(renderBlock({ type: "list", title: "L", rows: [{ label: "r", val: "v" }] })).toContain("viz-row");
    expect(renderBlock({ type: "factors", rows: [{ label: "f", weight: 30, status: "Good", pct: 70, tone: "good" }] })).toContain("Good");
    expect(renderBlock({ type: "verdict", tone: "warn", title: "V", detail: "d" })).toContain("V");
  });

  it("escapes user-editable strings (no HTML injection from the code editor)", () => {
    const html = renderBlock({ type: "header", title: "<script>x</script>", subtitle: "" });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("esc handles the dangerous characters", () => {
    expect(esc('a<b>&"c')).toBe("a&lt;b&gt;&amp;&quot;c");
  });
});
