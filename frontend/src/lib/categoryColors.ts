// Light per-category chip palette for the passenger menu category filter row.
// Keys match the category labels used in mealCategory()/categoriesList.
import React from "react";

export const CATEGORY_CHIP: Record<string, { bg: string; text: string }> = {
  "All":         { bg: "#E3F2FD", text: "#0A2F5E" },
  "Snacks":      { bg: "#FFF3E0", text: "#7C4A03" },
  "Starters":    { bg: "#E0F2F1", text: "#0F5E57" },
  "Main Course": { bg: "#E8F5E9", text: "#1B5E20" },
  "Beverages":   { bg: "#E0F7FA", text: "#006064" },
  "Alcohol":     { bg: "#F3E5F5", text: "#6A1B7A" },
  "Desserts":    { bg: "#FCE4EC", text: "#880E4F" },
};

// Selected style for a category chip. Returns undefined when not selected.
export function categoryChipStyle(cat: string, selected: boolean): React.CSSProperties | undefined {
  if (!selected) return undefined;
  const c = CATEGORY_CHIP[cat] || CATEGORY_CHIP["All"];
  return { background: c.bg, color: c.text, borderColor: c.bg };
}

// Single light-yellow selected style for the dietary filter row.
export function dietChipStyle(selected: boolean): React.CSSProperties | undefined {
  if (!selected) return undefined;
  return { background: "#FEFCE8", color: "#1A1A1A", borderColor: "#FEFCE8" };
}
