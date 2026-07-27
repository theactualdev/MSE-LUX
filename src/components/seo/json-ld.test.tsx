import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { JsonLd } from '@/components/seo/json-ld'

describe('JsonLd', () => {
  it('renders a script tag containing the serialized data', () => {
    const { container } = render(<JsonLd data={{ '@type': 'Product', name: 'Gold Ring' }} />)

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    expect(JSON.parse(script!.innerHTML)).toEqual({ '@type': 'Product', name: 'Gold Ring' })
  })

  // Pins the `<` → `\u003c` escape: without it, a product name containing
  // `</script>` would close the script tag early and let the rest of its
  // value execute as raw HTML in the page.
  it('escapes a `</script>`-containing value so it cannot break out of the tag', () => {
    const { container } = render(<JsonLd data={{ name: '</script><img src=x onerror=alert(1)>' }} />)

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    expect(script!.innerHTML).not.toContain('</script><img')
    expect(script!.innerHTML).toContain('\\u003c/script>')
    expect(JSON.parse(script!.innerHTML)).toEqual({ name: '</script><img src=x onerror=alert(1)>' })

    // Only one script tag exists — the malicious string never closed the real one.
    expect(container.querySelectorAll('script')).toHaveLength(1)
  })
})
