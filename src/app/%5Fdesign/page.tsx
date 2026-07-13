import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { formatMoney } from '@/lib/money'

const paletteTokens = [
  { name: 'background', className: 'bg-background' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'foreground', className: 'bg-foreground' },
  { name: 'muted', className: 'bg-muted' },
  { name: 'muted-foreground', className: 'bg-muted-foreground' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'accent-foreground', className: 'bg-accent-foreground' },
  { name: 'border', className: 'bg-border' },
  { name: 'ring', className: 'bg-ring' },
]

const buttonVariants = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const
const badgeVariants = ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const

/**
 * Hidden design-system reference ("kitchen sink"). Not linked in nav — visit
 * directly at /_design. Renders every semantic token, the type scale, and
 * every available primitive so regressions are visible at a glance.
 */
export default function DesignSystemPage() {
  const priceNgn = formatMoney({ amountMinor: 1_500_000, currency: 'NGN' })
  const priceUsd = formatMoney({ amountMinor: 999, currency: 'USD' })

  return (
    <Container className="flex flex-col gap-16 py-12 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Design System Reference
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Internal kitchen-sink page. Not linked in navigation — used to visually verify tokens
          and primitives.
        </p>
      </div>

      {/* Palette */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Palette" subtitle="Semantic tokens, never raw hex in components." />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {paletteTokens.map((token) => (
            <div key={token.name} className="flex flex-col gap-2">
              <div className={`h-16 w-full rounded-xl border border-border ${token.className}`} />
              <span className="text-xs text-muted-foreground">{token.name}</span>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Type scale */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Type Scale" subtitle="Playfair headings, Inter body." />
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-4xl font-semibold text-foreground">
            Playfair Display — Heading Large
          </h2>
          <h3 className="font-display text-2xl font-semibold text-foreground">
            Playfair Display — Heading Medium
          </h3>
          <p className="font-sans text-base text-foreground">
            Inter — Body copy. The quick brown fox jumps over the lazy dog. Used for paragraphs,
            labels, and general UI text throughout the storefront.
          </p>
        </div>
      </section>

      <Separator />

      {/* Buttons */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Buttons" subtitle="All variants; default size is 48px tall." />
        <div className="flex flex-wrap items-center gap-4">
          {buttonVariants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="sm">Small</Button>
          <Button size="default">Default (48px)</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      <Separator />

      {/* Form primitives */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Form Primitives" subtitle="Input, textarea, and label." />
        <div className="grid max-w-md gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="design-input">Email address</Label>
            <Input id="design-input" type="email" placeholder="you@example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="design-textarea">Message</Label>
            <Textarea id="design-textarea" placeholder="Write something..." />
          </div>
        </div>
      </section>

      <Separator />

      {/* Badges */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Badges" />
        <div className="flex flex-wrap items-center gap-3">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </section>

      <Separator />

      {/* Cards */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Cards" />
        <div className="grid max-w-sm gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Champagne Solitaire Ring</CardTitle>
              <CardDescription>18k gold, hand-set diamond</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                A timeless piece crafted for everyday elegance.
              </p>
            </CardContent>
            <CardFooter>
              <Button size="sm">Add to bag</Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      <Separator />

      {/* Skeleton */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Skeleton" subtitle="Loading placeholder state." />
        <div className="flex max-w-sm flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </section>

      <Separator />

      {/* Avatar */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Avatar" />
        <div className="flex items-center gap-4">
          <Avatar size="sm">
            <AvatarImage src="" alt="" />
            <AvatarFallback>SM</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarImage src="" alt="" />
            <AvatarFallback>MS</AvatarFallback>
          </Avatar>
          <Avatar size="lg">
            <AvatarImage src="" alt="" />
            <AvatarFallback>LG</AvatarFallback>
          </Avatar>
        </div>
      </section>

      <Separator />

      {/* Dialog */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Dialog" />
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm your selection</DialogTitle>
              <DialogDescription>
                This is a sample dialog used to verify the primitive renders correctly.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton>
              <Button>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <Separator />

      {/* Dropdown menu */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Dropdown Menu" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline">Open menu</Button>} />
          <DropdownMenuContent>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View details</DropdownMenuItem>
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive">Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </section>

      <Separator />

      {/* Money formatting */}
      <section className="flex flex-col gap-6">
        <SectionHeading title="Money Formatting" subtitle="formatMoney() sample output." />
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">NGN</span>
            <span className="font-display text-2xl font-semibold text-foreground">{priceNgn}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">USD</span>
            <span className="font-display text-2xl font-semibold text-foreground">{priceUsd}</span>
          </div>
        </div>
      </section>
    </Container>
  )
}
