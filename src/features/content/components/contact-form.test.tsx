import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContactForm } from '@/features/content/components/contact-form'

describe('ContactForm', () => {
  it('shows errors and no success panel when submitted empty', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ContactForm />)
    await user.click(screen.getByRole('button', { name: /send message/i }))
    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
    expect(screen.queryByText(/thanks/i)).not.toBeInTheDocument()
  })

  it('shows the success panel on a valid submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ContactForm />)
    await user.type(screen.getByLabelText(/name/i), 'Ada')
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/subject/i), 'Bracelet sizing')
    await user.type(screen.getByLabelText(/message/i), 'Could you help me pick a size?')
    await user.click(screen.getByRole('button', { name: /send message/i }))
    expect(await screen.findByText(/thanks/i)).toBeInTheDocument()
  })
})
