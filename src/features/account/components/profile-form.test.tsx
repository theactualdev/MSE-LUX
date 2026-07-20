import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileForm } from '@/features/account/components/profile-form'
import { saveProfile } from '@/features/account/actions'

vi.mock('@/features/account/actions', () => ({
  saveProfile: vi.fn(),
}))

const saveProfileMock = vi.mocked(saveProfile)

const DEFAULTS = { name: 'Ada Lovelace', phone: '' }
const EMAIL = 'ada@example.com'

describe('ProfileForm', () => {
  beforeEach(() => {
    saveProfileMock.mockReset()
    saveProfileMock.mockResolvedValue({})
  })

  it('prefills the name field and displays the email read-only', () => {
    render(<ProfileForm defaultValues={DEFAULTS} email={EMAIL} />)

    expect(screen.getByLabelText(/name/i)).toHaveValue('Ada Lovelace')
    const emailInput = screen.getByLabelText(/email/i)
    expect(emailInput).toHaveValue('ada@example.com')
    expect(emailInput).toBeDisabled()
    expect(emailInput).toHaveAttribute('readonly')
  })

  it('valid submit calls the save action with only the editable fields, never the email', async () => {
    const user = userEvent.setup()
    render(<ProfileForm defaultValues={DEFAULTS} email={EMAIL} />)

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Ada Byron')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(saveProfileMock).toHaveBeenCalledWith({
        name: 'Ada Byron',
        phone: '',
      })
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
  })

  it('invalid submit (empty name) shows an error and does not call the action', async () => {
    const user = userEvent.setup()
    render(<ProfileForm defaultValues={DEFAULTS} email={EMAIL} />)

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
    expect(saveProfileMock).not.toHaveBeenCalled()
  })

  it('surfaces a server-side rejection instead of claiming the save worked', async () => {
    // Previously uncoverable: the mock store's `updateProfile` could not fail,
    // so a rejected write would have shown "Saved." regardless.
    saveProfileMock.mockResolvedValue({ error: 'Something went wrong. Please try again.' })
    const user = userEvent.setup()
    render(<ProfileForm defaultValues={DEFAULTS} email={EMAIL} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('surfaces a transport failure rather than silently doing nothing', async () => {
    saveProfileMock.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<ProfileForm defaultValues={DEFAULTS} email={EMAIL} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })
})
