// Canonical cabin-class chip palette — used for ALL cabin filters across every portal.
// Keys match backend cabin_class values plus "all".
export const CABIN_CHIP: Record<string, { bg: string; text: string }> = {
  all:             { bg: "linear-gradient(135deg,#D1FAE5,#A7F3D0)", text: "#065F46" },
  first:           { bg: "linear-gradient(135deg,#FFF3E0,#FFE0B2)", text: "#7C4A03" },
  business:        { bg: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", text: "#0A2F5E" },
  premium_economy: { bg: "linear-gradient(135deg,#E0F2F1,#B2DFDB)", text: "#0F5E57" },
  economy:         { bg: "linear-gradient(135deg,#F3E5F5,#E1BEE7)", text: "#6A1B7A" },
};

// Inline style for a SELECTED cabin chip. Returns undefined for unselected
// (let the element keep its outline class).
export function cabinChipStyle(key: string, selected: boolean): React.CSSProperties | undefined {
  if (!selected) return undefined;
  const c = CABIN_CHIP[key] || CABIN_CHIP.all;
  return { background: c.bg, color: c.text };
}
