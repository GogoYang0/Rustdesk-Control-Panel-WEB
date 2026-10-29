import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AuditFilterInput from './AuditFilterInput'

function setup(onCommit = vi.fn(), value = '') {
  render(
    <AuditFilterInput label="动作" value={value} maxLength={128} width={200} onCommit={onCommit} />,
  )
  return { input: screen.getByLabelText('动作') as HTMLInputElement, onCommit }
}

describe('AuditFilterInput', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the draft local and commits after the idle window', () => {
    vi.useFakeTimers()
    const { input, onCommit } = setup()
    fireEvent.change(input, { target: { value: 'GET ' } })
    expect(input.value).toBe('GET ')
    expect(onCommit).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onCommit).toHaveBeenCalledWith('GET ')
  })

  it('commits immediately on blur and Enter', () => {
    const { input, onCommit } = setup()
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenLastCalledWith('first')

    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenLastCalledWith('second')
  })

  it('adopts an external value change without recommitting it', () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const tree = (value: string) => (
      <AuditFilterInput
        label="动作"
        value={value}
        maxLength={128}
        width={200}
        onCommit={onCommit}
      />
    )
    const { rerender } = render(tree(''))
    const input = screen.getByLabelText('动作') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'draft' } })
    rerender(tree('external'))
    expect(input.value).toBe('external')

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onCommit).not.toHaveBeenCalled()
  })
})
