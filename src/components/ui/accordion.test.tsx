import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

describe('Accordion', () => {
  it('reveals panel content when the trigger is activated', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <Accordion>
        <AccordionItem value="a">
          <AccordionTrigger>Question one</AccordionTrigger>
          <AccordionContent>Answer one</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )

    await user.click(screen.getByRole('button', { name: /question one/i }))

    expect(await screen.findByText('Answer one')).toBeVisible()
  })
})
