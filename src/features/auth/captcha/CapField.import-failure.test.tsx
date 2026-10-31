import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CapField from './CapField'

vi.mock('@cap.js/widget', () => {
  throw new Error('chunk failed')
})

describe('CapField import failure', () => {
  it('reports a load failure when the widget chunk cannot load', async () => {
    const onError = vi.fn()
    render(
      <CapField
        generation={1}
        apiEndpoint="https://cap.example.com/site-key/"
        onProof={vi.fn()}
        onError={onError}
      />,
    )

    await waitFor(() => expect(onError).toHaveBeenCalledWith('验证码组件加载失败，请重试。'))
  })
})
