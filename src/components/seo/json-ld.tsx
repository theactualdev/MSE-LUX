// Server component: emits a JSON-LD `<script>` tag for structured data
// (Product, BreadcrumbList, Organization, ...). No 'use client' — this must
// render on the server so the markup is present in the initial HTML for
// crawlers that don't execute JS.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Escaping every `<` to the literal sequence backslash-u-0-0-3-c prevents a
  // value containing `</script>` from prematurely closing the tag and having
  // the remainder parsed as HTML.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
