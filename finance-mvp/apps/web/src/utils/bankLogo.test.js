import { describe, it, expect } from "vitest";
import { bankBrand, accountInstitution, accountLogoSrc } from "./bankLogo";

describe("bankLogo", () => {
  it("maps major institutions to their brand mark", () => {
    expect(bankBrand("Bank of America").mark).toBe("BofA");
    expect(bankBrand("Chase Sapphire").mark).toBe("CH");
    expect(bankBrand("American Express").mark).toBe("AX");
    expect(bankBrand("Rocket Mortgage").mark).toBe("RM");
    expect(bankBrand("Digital Federal Credit Union").mark).toBe("DCU");
  });

  it("returns a stable, deterministic mark for unknown institutions", () => {
    const a = bankBrand("Acme Community Bank");
    const b = bankBrand("Acme Community Bank");
    expect(a).toEqual(b);
    expect(a.mark).toBe("AC"); // first letters of first two words
    expect(a.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("resolves the best institution label for an account", () => {
    expect(accountInstitution({ institution: "Wells Fargo", name: "Checking" })).toBe("Wells Fargo");
    expect(accountInstitution({ officialName: "Chase Total Checking" })).toBe("Chase Total Checking");
    expect(accountInstitution({})).toBe("Account");
  });

  it("builds a data URI only when a base64 logo is present", () => {
    expect(accountLogoSrc({})).toBeNull();
    expect(accountLogoSrc({ logo: "iVBORw0KGgo=" })).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(accountLogoSrc({ logo: "data:image/svg+xml;base64,PHN2Zz4=" })).toBe("data:image/svg+xml;base64,PHN2Zz4=");
  });
});
