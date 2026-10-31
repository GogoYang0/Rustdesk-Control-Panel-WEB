import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CapField from './CapField'

vi.mock('@cap.js/widget', () => ({}))

afterEach(() => vi.useRealTimers())

describe('CapField registration timeout', () => {
  it('reports a load failure when the widget never registers', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    render(
      <CapField
        generation={1}
        apiEndpoint="https://cap.example.com/site-key/"
        onProof={vi.fn()}
        onError={onError}
      />,
    )

    await vi.advanceTimersByTimeAsync(10_000)
    expect(onError).toHaveBeenCalledWith('验证码组件加载失败，请重试。')
  })
})
