import React from "react";
import { bankBrand, accountInstitution, accountLogoSrc } from "../../utils/bankLogo";

/* BankLogo — a recognizable brand mark for a linked institution, shown beside income figures
   and account rows (reference IMG_1736). Prefers a real base64 logo if the account carries one,
   otherwise renders the institution's brand-colored monogram. Self-contained + offline; the two
   brand colors come from utils/bankLogo (brand facts, not themeable UI). */
export default function BankLogo({ account, name, size = 26 }) {
  const label = name || (account ? accountInstitution(account) : "Account");
  const src = account ? accountLogoSrc(account) : null;
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        style={{ borderRadius: "50%", objectFit: "cover", flex: "0 0 auto", background: "var(--tv-card)" }}
      />
    );
  }
  const brand = bankBrand(label);
  const fontSize = brand.mark.length >= 4 ? size * 0.32 : brand.mark.length === 3 ? size * 0.38 : size * 0.42;
  return (
    <span
      aria-hidden="true"
      title={label}
      style={{
        width: size, height: size, borderRadius: "50%", flex: "0 0 auto",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        // theme-guard-allow-start: institution brand colours are fixed brand facts, not themed UI.
        background: brand.bg, color: brand.fg,
        // theme-guard-allow-end
        fontWeight: 800, fontSize, letterSpacing: "-.02em", lineHeight: 1,
        boxShadow: "0 1px 4px rgba(0,0,0,.22)",
      }}
    >
      {brand.mark}
    </span>
  );
}
