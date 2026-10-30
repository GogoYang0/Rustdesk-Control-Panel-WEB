import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import AltchaField from './AltchaField'

vi.mock('altcha', () => ({}))
vi.mock('altcha/i18n/zh-cn', () => ({}))

class FakeAltcha extends HTMLElement {
  static instances: FakeAltcha[] = []
  configure = vi.fn()
  reset = vi.fn()
  verify = vi.fn(async () => {
    this.dispatchEvent(new CustomEvent('verified', { detail: { payload: 'payload-1' } }))
  })

  constructor() {
    super()
    FakeAltcha.instances.push(this)
  }
}

beforeAll(() => {
  if (!customElements.get('altcha-widget')) customElements.define('altcha-widget', FakeAltcha)
})

beforeEach(() => {
  FakeAltcha.instances = []
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
})

afterEach(() => vi.restoreAllMocks())

function renderField(overrides: Partial<Parameters<typeof AltchaField>[0]> = {}) {
  const props = {
    generation: 1,
    params: { challenge: 'c1', salt: 's1', signature: 'sig1', maxNumber: 100000 },
    onProof: vi.fn(),
    onExpired: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  }
  const view = render(<AltchaField key={props.generation} {...props} />)
  return { ...props, ...view, element: () => FakeAltcha.instances.at(-1)! }
}

describe('AltchaField', () => {
  it('configures the widget, verifies explicitly and maps the payload', async () => {
    const { onProof, element } = renderField()

    await waitFor(() => expect(onProof).toHaveBeenCalled())
    expect(onProof).toHaveBeenCalledWith({ response: { payload: 'payload-1' } })
    expect(element().configure).toHaveBeenCalledWith({
      challenge: { challenge: 'c1', salt: 's1', signature: 'sig1', maxNumber: 100000 },
      auto: 'off',
      display: 'standard',
      language: 'zh-cn',
      minDuration: 500,
    })
    expect(element().verify).toHaveBeenCalledTimes(1)
  })

  it('reports expiry and provider state errors', async () => {
    const { onExpired, onError, element } = renderField()
    await waitFor(() => expect(element().verify).toHaveBeenCalled())

    element().dispatchEvent(new CustomEvent('expired'))
    element().dispatchEvent(new CustomEvent('statechange', { detail: { state: 'error' } }))

    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('验证码验证失败，请重试。')
  })

  it('rebuilds and reconfigures when the generation changes', async () => {
    const { rerender, onProof, element } = renderField()
    await waitFor(() => expect(onProof).toHaveBeenCalled())
    const first = element()

    rerender(
      <AltchaField
        key={2}
        generation={2}
        params={{ challenge: 'c2' }}
        onProof={onProof}
        onExpired={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await waitFor(() => expect(FakeAltcha.instances).toHaveLength(2))
    expect(first.isConnected).toBe(false)
    expect(FakeAltcha.instances[1].configure).toHaveBeenCalledWith(
      expect.objectContaining({ challenge: { challenge: 'c2' } }),
    )
  })

  it('refuses to start outside a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    const { onError, element } = renderField()

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('安全上下文')))
    expect(element().configure).not.toHaveBeenCalled()
  })
})
