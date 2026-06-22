import { describe, it, expect } from "vitest";
import { resolveNav } from "./remoteConfig";

const SECTIONS = [{ id: "finance", label: "Finance", order: 0 }];
const REG = {
  home:   { id: "home",   route: "/",     icon: "i", title: "Home",   section: "finance", defaultOrder: 0,  inNavByDefault: true },
  tax:    { id: "tax",    route: "/tax",  icon: "t", title: "Taxes",  section: "finance", defaultOrder: 12, inNavByDefault: true },
  hidden: { id: "hidden", route: "/h",   icon: "h", title: "Hidden", section: "finance", defaultOrder: 5,  inNavByDefault: true },
  route:  { id: "route",  route: "/r",   icon: "r", title: "Route",  section: null,      defaultOrder: 0,  inNavByDefault: false },
};
const ids = (nav) => nav.flatMap((s) => s.items.map((i) => i.id));

describe("resolveNav union with registry", () => {
  it("shows a registry module the remote config never mentions", () => {
    const cfg = { sections: SECTIONS, modules: [{ id: "home", section: "finance", enabled: true }] };
    const nav = resolveNav(cfg, REG);
    expect(ids(nav)).toContain("home");
    expect(ids(nav)).toContain("tax"); // new module appears without a config update
  });

  it("keeps a config-disabled module hidden (union does not re-add it)", () => {
    const cfg = { sections: SECTIONS, modules: [{ id: "hidden", section: "finance", enabled: false }] };
    expect(ids(resolveNav(cfg, REG))).not.toContain("hidden");
  });

  it("never adds route-only modules to the nav", () => {
    const cfg = { sections: SECTIONS, modules: [{ id: "home", section: "finance", enabled: true }] };
    expect(ids(resolveNav(cfg, REG))).not.toContain("route");
  });
});
