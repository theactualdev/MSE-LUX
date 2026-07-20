import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileForm } from '@/features/account/components/profile-form'
import { saveProfile } from '@/features/account/actions'

vi.mock('@/features/account/actions', () => ({
  saveProfile: vi.fn(),
}))

const saveProfileMock = vi.mocked(saveProfile)

const DEFAULTS = { name: 'Ada Lovelace', email: 'ada@example.com', phone: '' }

describe('ProfileForm', () => {
  beforeEach(() => {
    saveProfileMock.mockReset()
    saveProfileMock.mockResolvedValue({})
  })

  it('prefills fields from the profile the server passed in', () => {
    render(<ProfileForm defaultValues={DEFAULTS} />)

    expect(screen.getByLabelText(/name/i)).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ada@example.com')
  })

  it('valid submit calls the save action and shows a saved confirmation', async () => {
    const user = userEvent.setup()
    render(<ProfileForm defaultValues={DEFAULTS} />)

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Ada Byron')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(saveProfileMock).toHaveBeenCalledWith({
        name: 'Ada Byron',
        email: 'ada@example.com',
        phone: '',
      })
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
  })

  it('invalid submit (empty name) shows an error and does not call the action', async () => {
    const user = userEvent.setup()
    render(<ProfileForm defaultValues={DEFAULTS} />)

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
    expect(saveProfileMock).not.toHaveBeenCalled()
  })

  it('surfaces a server-side rejection instead of claiming the save worked', async () => {
    // Previously uncoverable: the mock store's `updateProfile` could not fail,
    // so a rejected write would have shown "Saved." regardless.
    saveProfileMock.mockResolvedValue({ error: 'That email address is already in use.' })
    const user = userEvent.setup()
    render(<ProfileForm defaultValues={DEFAULTS} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already in use/i)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('surfaces a transport failure rather than silently doing nothing', async () => {
    saveProfileMock.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<ProfileForm defaultValues={DEFAULTS} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })
})
