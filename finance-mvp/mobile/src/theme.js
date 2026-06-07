// TerraVest design tokens ported from the web (apps/web/src/styles/terravest-theme.css)
// so the mobile app matches the web visual language.
export const theme = {
  colors: {
    forest: '#1A4D3B',
    forestMid: '#2D6B52',
    forestLight: '#3D8A68',
    sagePale: '#EAF3EE',
    gold: '#C9973A',
    positive: '#1E7B4B',
    positiveBg: '#E6F4EC',
    negative: '#C0392B',
    negativeBg: '#FDECEA',
    bg: '#F4F6F5',
    card: '#FFFFFF',
    border: '#DDE5E1',
    textPrimary: '#111D17',
    textSecondary: '#4A5E54',
    textMuted: '#7A9086',
  },
  radius: { sm: 6, md: 10, lg: 16 },
  spacing: (n) => n * 4,
  font: { display: 'Georgia', body: 'System' },
};
