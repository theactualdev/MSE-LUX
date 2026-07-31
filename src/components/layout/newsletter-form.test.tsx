import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewsletterForm } from '@/components/layout/newsletter-form'

const subscribe = vi.hoisted(() => vi.fn())
vi.mock('@/features/newsletter/actions', () => ({ subscribe }))

beforeEach(() => {
  subscribe.mockReset()
})

describe('NewsletterForm', () => {
  it('submits the typed email and replaces the form with the success message', async () => {
    subscribe.mockResolvedValue({ ok: true, message: 'Check your email to confirm your subscription.' })
    const user = userEvent.setup()
    render(<NewsletterForm />)

    await user.type(screen.getByLabelText('Join the newsletter'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(subscribe).toHaveBeenCalledWith('ada@example.com')
    expect(await screen.findByText('Check your email to confirm your subscription.')).toBeInTheDocument()
    // The input is gone — a success state, not a cleared form.
    expect(screen.queryByLabelText('Join the newsletter')).not.toBeInTheDocument()
  })

  it('shows the action error and keeps the form usable', async () => {
    subscribe.mockResolvedValue({ ok: false, error: 'Enter a valid email address.' })
    const user = userEvent.setup()
    render(<NewsletterForm />)

    await user.type(screen.getByLabelText('Join the newsletter'), 'nope@example.com')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(subscribe).toHaveBeenCalledWith('nope@example.com')
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Join the newsletter')).toBeInTheDocument()
  })

  it('announces the result to assistive tech via a live region', async () => {
    subscribe.mockResolvedValue({ ok: false, error: 'Enter a valid email address.' })
    const user = userEvent.setup()
    render(<NewsletterForm />)
    await user.type(screen.getByLabelText('Join the newsletter'), 'nope@example.com')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    const region = await screen.findByRole('status')
    expect(region).toHaveTextContent('Enter a valid email address.')
  })
})
