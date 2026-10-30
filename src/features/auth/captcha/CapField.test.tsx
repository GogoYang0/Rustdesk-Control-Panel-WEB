import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CapField from './CapField'

interface FakeCapElement extends HTMLElement {
  resetCalls: number
}

const capMock = vi.hoisted(() => ({ instances: [] as FakeCapElement[] }))

vi.mock('@cap.js/widget', () => {
  class FakeCap extends HTMLElement {
    resetCalls = 0

    constructor() {
      super()
      capMock.instances.push(this as FakeCapElement)
    }

    reset() {
      this.resetCalls += 1
    }
  }
  if (!customElements.get('cap-widget')) customElements.define('cap-widget', FakeCap)
  return {}
})

beforeEach(() => {
  capMock.instances = []
})

afterEach(() => vi.restoreAllMocks())

function renderField(overrides: Partial<Parameters<typeof CapField>[0]> = {}) {
  const props = {
    generation: 1,
    apiEndpoint: 'https://cap.example.com/site-key/',
    onProof: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  }
  const view = render(<CapField key={props.generation} {...props} />)
  return { ...props, ...view }
}

describe('CapField', () => {
  it('maps a Cap solve token to the API proof shape', async () => {
    const { onProof } = renderField()
    await waitFor(() => expect(capMock.instances).toHaveLength(1))
    const widget = capMock.instances[0]
    expect(widget.getAttribute('data-cap-api-endpoint')).toBe('https://cap.example.com/site-key/')

    await act(async () => {
      widget.dispatchEvent(new CustomEvent('solve', { detail: { token: 'cap-token' } }))
    })
    expect(onProof).toHaveBeenCalledWith({ response: { response: 'cap-token' } })
  })

  it('reports a provider error without echoing its message', async () => {
    const { onError } = renderField()
    await waitFor(() => expect(capMock.instances).toHaveLength(1))

    await act(async () => {
      capMock.instances[0].dispatchEvent(
        new CustomEvent('error', { detail: { isCap: true, code: 'x', message: 'raw error' } }),
      )
    })
    expect(onError).toHaveBeenCalledWith('验证码验证失败，请重试。')
  })

  it('rejects insecure non-loopback endpoints', async () => {
    const { onError } = renderField({ apiEndpoint: 'http://cap.example.com/site-key/' })

    await waitFor(() => expect(onError).toHaveBeenCalledWith('验证码参数无效，请联系管理员。'))
  })

  it('resets the old widget and mounts a fresh one on generation change', async () => {
    const { rerender } = renderField()
    await waitFor(() => expect(capMock.instances).toHaveLength(1))
    const first = capMock.instances[0]

    rerender(
      <CapField
        key={2}
        generation={2}
        apiEndpoint="https://cap.example.com/site-key/"
        onProof={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await waitFor(() => expect(capMock.instances).toHaveLength(2))
    expect(first.resetCalls).toBe(1)
  })
})
