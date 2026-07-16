/**
 * Swatch colors for the product color vocabulary. These hexes represent
 * PHYSICAL PRODUCT colors (an amber bead, an onyx stone), not UI theme
 * tokens — a deliberate, documented exception to the tokens-only rule, since
 * a real-world material color has no semantic token equivalent.
 */
export const COLOR_SWATCHES: Record<string, string> = {
  Amber: '#C8881F',
  Cobalt: '#2A4BA0',
  Coral: '#E8705B',
  Emerald: '#1F7A5A',
  Ivory: '#F1EADA',
  Jade: '#3E9E7E',
  Onyx: '#2B2B2E',
  Turquoise: '#2FB0B0',
}

/** Returns the curated swatch hex for a color name, or undefined if unknown. */
export function getSwatchColor(name: string): string | undefined {
  return COLOR_SWATCHES[name]
}
