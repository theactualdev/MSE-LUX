import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FaqAccordion } from '@/features/content/components/faq-accordion'
import type { FaqGroup } from '@/features/content/types'

const GROUPS: FaqGroup[] = [
  {
    heading: 'Orders & shipping',
    items: [
      { q: 'Where do you ship from?', a: 'We ship from Lagos, Nigeria.' },
      { q: 'Can I track my order?', a: 'Yes, a tracking link is emailed at dispatch.' },
    ],
  },
]

describe('FaqAccordion', () => {
  it('renders each question as a trigger button and reveals its answer on click', async () => {
    const user = userEvent.setup({ delay: null })
    render(<FaqAccordion groups={GROUPS} />)

    const firstTrigger = screen.getByRole('button', { name: /where do you ship from\?/i })
    const secondTrigger = screen.getByRole('button', { name: /can i track my order\?/i })
    expect(firstTrigger).toBeInTheDocument()
    expect(secondTrigger).toBeInTheDocument()

    await user.click(firstTrigger)

    expect(await screen.findByText('We ship from Lagos, Nigeria.')).toBeVisible()
  })
})
