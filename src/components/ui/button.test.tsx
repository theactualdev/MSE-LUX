import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('renders its label and is 48px tall by default', () => {
    render(<Button>Add to bag</Button>)
    const btn = screen.getByRole('button', { name: 'Add to bag' })
    expect(btn).toBeInTheDocument()
    expect(btn.className).toContain('h-12')
  })
})
