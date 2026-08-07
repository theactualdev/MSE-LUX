import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { GateForm } from '@/features/gate/components/gate-form'
import { safeReturnPath } from '@/features/gate/gate'
import { GATE_COOKIE, verifyGateToken } from '@/features/gate/session'
import { siteConfig } from '@/lib/config'

interface GatePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The launch curtain. Everything a visitor without the password can see of
 * the store — which is why it renders NO catalog data, no navigation, and no
 * links inward: just the brand and the door.
 *
 * Two server-side bounces keep the page coherent with the proxy:
 * - gate disabled (`SITE_PASSWORD` unset) → the proxy never sends anyone
 *   here, so a stale bookmark goes home rather than showing a dead door;
 * - already authenticated → straight through to wherever they were headed.
 */
export default async function GatePage({ searchParams }: GatePageProps) {
  const sitePassword = process.env.SITE_PASSWORD
  const params = await searchParams
  const rawFrom = typeof params.from === 'string' ? params.from : '/'
  const from = safeReturnPath(rawFrom)

  if (!sitePassword) redirect('/')

  const cookieStore = await cookies()
  if (await verifyGateToken(cookieStore.get(GATE_COOKIE)?.value, sitePassword)) {
    redirect(from)
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-6 py-16 text-foreground">
      {/* Hairline plate frame + a faint champagne wash — the same visual
          language as the brand's OG card, restrained to two decorations. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-3 border border-accent/40 sm:inset-5" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(201,168,106,0.14),_transparent_65%)]"
      />

      <div className="flex w-full max-w-sm flex-col items-center gap-10 text-center">
        <header className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-700 motion-reduce:animate-none">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Handcrafted in Lagos
          </p>
          <p className="font-display text-4xl font-semibold uppercase tracking-[0.18em] sm:text-5xl">
            {siteConfig.name}
          </p>
          <span aria-hidden="true" className="h-px w-14 bg-accent" />
        </header>

        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-700 [animation-delay:150ms] motion-reduce:animate-none">
          <h1 className="font-display text-2xl text-foreground sm:text-3xl">
            Something beautiful is almost ready.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Our store is opening privately. If you&rsquo;ve been given the password, come on in.
          </p>
        </div>

        <div className="w-full animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-700 [animation-delay:300ms] motion-reduce:animate-none">
          <GateForm from={from} />
        </div>
      </div>
    </main>
  )
}
