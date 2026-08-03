/**
 * Generates the brand raster assets that metadata references:
 *
 *   public/og-default.png   1200x630  social unfurl card (og:image / twitter:image)
 *   public/logo.png          512x512  schema.org Organization.logo
 *   src/app/apple-icon.png   180x180  iOS add-to-home-screen
 *   src/app/favicon.ico     16/32/48  browser tab, bookmarks, Google SERP
 *
 * These are committed binaries — this script exists so they are reproducible
 * and on-palette rather than mystery files nobody can regenerate. Run it after
 * changing the palette in `globals.css`:
 *
 *   npx tsx scripts/generate-brand-assets.ts
 *
 * Colours are duplicated from `globals.css` as literals on purpose: sharp
 * rasterises SVG and cannot resolve CSS custom properties, and a build step
 * that parsed the stylesheet would be far more machinery than four hex codes
 * justify. If the palette changes, change it here too — the constants below
 * are the only place that needs editing.
 *
 * Text is rendered with a generic serif stack rather than Playfair Display:
 * sharp's SVG rasteriser resolves fonts through the host's fontconfig, so
 * naming a webfont Next loads at runtime would silently fall back to a default
 * on any machine that doesn't have it installed. Georgia is the closest
 * always-present match to the display face and keeps output deterministic.
 */
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const IVORY = '#faf7f2'
const CHAMPAGNE = '#c9a86a'
const CHAMPAGNE_DEEP = '#b08d4f'
const CHARCOAL = '#2b2724'
const STONE = '#6b6258'

const SERIF = "Georgia, 'Times New Roman', 'Nimbus Roman', serif"
// `process.cwd()`, not `import.meta.dirname`: the package is CommonJS, so tsx
// transpiles this to CJS where `import.meta` is unavailable. Run from the
// repository root (the npm script does).
const ROOT = process.cwd()

/** 1200x630 unfurl card: wordmark, rule, tagline, domain. */
function ogSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${IVORY}"/>
  <rect x="28" y="28" width="1144" height="574" fill="none" stroke="${CHAMPAGNE}" stroke-width="1.5" opacity="0.55"/>
  <text x="600" y="292" text-anchor="middle" font-family="${SERIF}" font-size="108" letter-spacing="14" fill="${CHARCOAL}">MSE LUX</text>
  <rect x="530" y="338" width="140" height="2" fill="${CHAMPAGNE}"/>
  <text x="600" y="404" text-anchor="middle" font-family="${SERIF}" font-size="31" letter-spacing="1.5" fill="${STONE}">Handmade beads, jewelry &amp; accessories</text>
  <text x="600" y="452" text-anchor="middle" font-family="${SERIF}" font-size="25" letter-spacing="5" fill="${CHAMPAGNE_DEEP}">CRAFTED IN LAGOS</text>
  <text x="600" y="556" text-anchor="middle" font-family="${SERIF}" font-size="22" letter-spacing="4" fill="${CHAMPAGNE_DEEP}">mselux.co</text>
</svg>`
}

/**
 * Square monogram used for the logo and every icon size. Charcoal ground with
 * a champagne "M" — the inverse of the site's ivory pages, because a light
 * icon disappears against the light chrome of a browser tab.
 */
function markSvg(size: number): string {
  const inset = size * 0.06
  const stroke = Math.max(1, size * 0.016)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${CHARCOAL}"/>
  <rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}" fill="none" stroke="${CHAMPAGNE}" stroke-width="${stroke}" opacity="0.8"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="${SERIF}" font-size="${size * 0.54}" fill="${CHAMPAGNE}">M</text>
</svg>`
}

const png = (svg: string): Promise<Buffer> => sharp(Buffer.from(svg)).png().toBuffer()

/**
 * Packs PNGs into an ICO container. Windows has accepted PNG-compressed ICO
 * entries since Vista and every current browser follows suit, so no BMP
 * fallback is emitted.
 *
 * A 256px entry would be written as 0 in the single width/height bytes (the
 * format's convention for 256); nothing here reaches that size, but the
 * `% 256` keeps the encoding correct if a larger size is ever added.
 */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const HEADER = 6
  const ENTRY = 16
  const header = Buffer.alloc(HEADER)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  let offset = HEADER + ENTRY * images.length
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(ENTRY)
    entry.writeUInt8(size % 256, 0)
    entry.writeUInt8(size % 256, 1)
    entry.writeUInt8(0, 2) // palette size: 0 = not paletted
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)])
}

async function main() {
  const [og, logo, appleIcon, ico16, ico32, ico48] = await Promise.all([
    png(ogSvg()),
    png(markSvg(512)),
    png(markSvg(180)),
    png(markSvg(16)),
    png(markSvg(32)),
    png(markSvg(48)),
  ])

  const written: [string, Buffer][] = [
    ['public/og-default.png', og],
    ['public/logo.png', logo],
    ['src/app/apple-icon.png', appleIcon],
    [
      'src/app/favicon.ico',
      ico([
        { size: 16, data: ico16 },
        { size: 32, data: ico32 },
        { size: 48, data: ico48 },
      ]),
    ],
  ]

  for (const [relativePath, data] of written) {
    await writeFile(path.join(ROOT, relativePath), data)
    console.log(`${relativePath.padEnd(26)} ${data.length.toLocaleString()} bytes`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
