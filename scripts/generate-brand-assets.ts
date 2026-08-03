/**
 * Derives every brand raster the site references from the single master logo
 * at `assets/brand/logo-source.jpeg`:
 *
 *   public/og-default.png   1200x630  social unfurl card (og:image / twitter:image)
 *   public/logo.png          512x512  schema.org Organization.logo
 *   src/app/apple-icon.png   180x180  iOS add-to-home-screen
 *   src/app/favicon.ico     16/32/48  browser tab, bookmarks, Google SERP
 *
 * The outputs are committed binaries; this script exists so they are
 * reproducible from the master rather than being mystery files nobody can
 * regenerate. Re-run after replacing the source:
 *
 *   npm run brand:assets
 *
 * The source lives OUTSIDE `public/` deliberately. It is a generation input,
 * not a served asset — shipping it would publish a second, uncropped copy of
 * the logo at a URL nothing links to.
 *
 * Two different crops are used, because one framing cannot serve both jobs.
 * The master is a square composition: wordmark centred, pearl strand entering
 * from the left, silk falling away above and below. A social card wants that
 * negative space (it is what makes the card look composed); an icon cannot
 * afford any of it, because at 16px every pixel spent on background is a pixel
 * not spent making "MSE" legible.
 */
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

// `process.cwd()`, not `import.meta.dirname`: the package is CommonJS, so tsx
// transpiles this to CJS where `import.meta` is unavailable. Run from the
// repository root (the npm script does).
const ROOT = process.cwd()
const SOURCE = path.join(ROOT, 'assets/brand/logo-source.jpeg')

/** Master dimensions. Asserted at runtime — every crop below is expressed in these pixels. */
const SOURCE_SIZE = 1080

interface Crop {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The full square outputs are NOT cropped.
 *
 * A tightened crop was tried first, to make the wordmark fill more of the
 * frame, and it clipped the E — a luminance threshold measures where the mark
 * is *bright*, not where it ends, and the rose-gold falloff on its right edge
 * reads as background. Rather than tune a threshold until it stops cutting the
 * logo, take the composition as drawn: the master is already square, already
 * centred, with margins the designer chose. Scaling it whole cannot clip
 * anything.
 */
const FULL_MARK_CROP = null

/**
 * Favicon colours, sampled from the master rather than picked by eye:
 * the silk ground reads #160219 in shadow and #380940 where it catches light,
 * and the letterforms average #ad949e with white speculars. PLUM sits between
 * the two silk values — at 16px the true shadow tone is indistinguishable
 * from black, which would lose the purple the brand is recognised by.
 */
const PLUM = '#2c0733'
const ROSE_SILVER = '#f3e7ec'

/**
 * The favicon is DRAWN, not cropped from the master — the one place this
 * pipeline departs from the real logo, and deliberately.
 *
 * Cropping to the M was tried first. At 48px it is passable; at 32px the pearl
 * strand crossing the stem makes the glyph ambiguous, and at 16px the whole
 * thing is an unreadable smudge. That is not a tuning problem: a photographic
 * metallic letterform over dark silk has no legible silhouette once it is
 * sixteen pixels wide, because the very gradients that make it look expensive
 * at full size average out to mud.
 *
 * So the favicon takes the logo's COLOURS and reproduces its letter as flat
 * shapes, which is the only thing that survives at tab size. It reads as the
 * same brand while remaining a recognisable M — where a faithful crop would
 * read as neither.
 *
 * Every larger asset still comes from the master untouched.
 */
function monogramSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${PLUM}"/>
  <text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-size="76" fill="${ROSE_SILVER}">M</text>
</svg>`
}

/**
 * 1.905:1 slice for the social card, centred on the wordmark rather than on
 * the image: the wordmark sits above the vertical centre of the master, so a
 * naive centre crop would cut the top of the letterforms.
 */
const CARD_CROP = { left: 0, top: 185, width: SOURCE_SIZE, height: 567 }

const source = () => sharp(SOURCE)

/**
 * Square PNG at `size` from the given crop.
 *
 * `quality`/`effort` matter more than they look: the master is a photographic
 * render — metallic gradients over silk — and lossless PNG of that is enormous
 * (the 512px logo lands near 400 kB untuned). Palette quantisation gets it to
 * a fraction of that; at these sizes the banding it introduces is invisible,
 * and an og:image that takes a second to fetch is a card that renders late.
 */
async function square(crop: Crop | null, size: number): Promise<Buffer> {
  const pipeline = source()
  if (crop) pipeline.extract(crop)
  return pipeline.resize(size, size, { fit: 'cover' }).png({ palette: true, quality: 90, effort: 10 }).toBuffer()
}

/** Drawn monogram at `size`, square. */
async function monogram(size: number): Promise<Buffer> {
  return sharp(Buffer.from(monogramSvg(size))).png().toBuffer()
}

/** The 1200x630 unfurl card. */
async function card(): Promise<Buffer> {
  return source()
    .extract(CARD_CROP)
    .resize(1200, 630, { fit: 'cover' })
    .png({ palette: true, quality: 90, effort: 10 })
    .toBuffer()
}

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
  const { width, height } = await source().metadata()
  if (width !== SOURCE_SIZE || height !== SOURCE_SIZE) {
    // The crops are absolute pixel rectangles, so a resized or reshot master
    // would silently frame everything wrong — a cropped-off wordmark in the
    // favicon is exactly the kind of defect nobody notices for months.
    throw new Error(
      `Expected a ${SOURCE_SIZE}x${SOURCE_SIZE} master at assets/brand/logo-source.jpeg, got ${width}x${height}. ` +
        `Re-check ICON_CROP and CARD_CROP against the new dimensions before regenerating.`,
    )
  }

  const [og, logo, appleIcon, ico16, ico32, ico48] = await Promise.all([
    card(),
    // The master, whole, wherever there is resolution to read it...
    square(FULL_MARK_CROP, 512),
    square(FULL_MARK_CROP, 180),
    // ...and a drawn monogram where there is not. See monogramSvg.
    monogram(16),
    monogram(32),
    monogram(48),
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
