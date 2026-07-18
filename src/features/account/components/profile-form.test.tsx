import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileForm } from '@/features/account/components/profile-form'
import { useAuthStore } from '@/features/account/store'
import { buildMockUser } from '@/features/account/lib/mock-user'

describe('ProfileForm', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: buildMockUser('ada@example.com', 'Ada Lovelace') })
  })

  it('prefills fields from the current user', () => {
    render(<ProfileForm />)

    expect(screen.getByLabelText(/name/i)).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ada@example.com')
  })

  it('valid submit updates the profile and shows a saved confirmation', async () => {
    const user = userEvent.setup()
    render(<ProfileForm />)

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Ada Byron')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(useAuthStore.getState().user?.name).toBe('Ada Byron')
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
  })

  it('invalid submit (empty name) shows an error and does not save', async () => {
    const user = userEvent.setup()
    render(<ProfileForm />)

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
    expect(useAuthStore.getState().user?.name).toBe('Ada Lovelace')
  })
})
