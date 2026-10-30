import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import GeeTestField from './GeeTestField'

const scriptMock = vi.hoisted(() => ({ loadExternalScript: vi.fn() }))
vi.mock('../../../lib/external-script', () => ({
  loadExternalScript: scriptMock.loadExternalScript,
}))

interface Callbacks {
  ready?: () => void
  success?: () => void
  error?: (err: unknown) => void
}

function installGeeTest() {
  const callbacks: Callbacks = {}
  const captcha = {
    onReady: vi.fn((cb: () => void) => {
      callbacks.ready = cb
    }),
    onSuccess: vi.fn((cb: () => void) => {
      callbacks.success = cb
    }),
    onError: vi.fn((cb: (err: unknown) => void) => {
      callbacks.error = cb
    }),
    onClose: vi.fn(),
    showCaptcha: vi.fn(),
    verify: vi.fn(),
    getValidate: vi.fn(() => ({
      lot_number: 'lot-1',
      captcha_output: 'output-1',
      pass_token: 'pass-1',
      gen_time: '1700000000',
    })),
    destroy: vi.fn(),
  }
  const init = vi.fn((_options: Record<string, unknown>, cb: (value: typeof captcha) => void) => {
    cb(captcha)
  })
  window.initGeetest4 = init
  return { callbacks, captcha, init }
}

function renderField(overrides: Partial<Parameters<typeof GeeTestField>[0]> = {}) {
  const props = {
    generation: 1,
    captchaId: 'captcha-id',
    scriptUrl: 'https://static.geetest.com/v4/gt4.js',
    onProof: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  }
  const view = render(<GeeTestField key={props.generation} {...props} />)
  return { ...props, ...view }
}

beforeEach(() => scriptMock.loadExternalScript.mockReset().mockResolvedValue(undefined))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete window.initGeetest4
})

describe('GeeTestField', () => {
  it('initialises the bind product and maps a successful validation', async () => {
    const { callbacks, captcha, init } = installGeeTest()
    const { onProof } = renderField()

    await waitFor(() => expect(init).toHaveBeenCalled())
    expect(scriptMock.loadExternalScript).toHaveBeenCalledWith(
      'https://static.geetest.com/v4/gt4.js',
      10_000,
      expect.any(Function),
    )
    expect(init.mock.calls[0][0]).toEqual({
      captchaId: 'captcha-id',
      product: 'bind',
      language: 'zho',
    })

    await act(async () => callbacks.ready?.())
    fireEvent.click(screen.getByRole('button', { name: '点击完成安全验证' }))
    expect(captcha.showCaptcha).toHaveBeenCalled()

    await act(async () => callbacks.success?.())
    expect(onProof).toHaveBeenCalledWith({
      response: {
        lot_number: 'lot-1',
        captcha_output: 'output-1',
        pass_token: 'pass-1',
        gen_time: '1700000000',
      },
    })
  })

  it('rejects malformed validation and provider errors', async () => {
    const { callbacks, captcha } = installGeeTest()
    captcha.getValidate.mockReturnValue({ lot_number: 'only-one' } as never)
    const { onError } = renderField()
    await waitFor(() => expect(window.initGeetest4).toHaveBeenCalled())

    await act(async () => callbacks.success?.())
    expect(onError).toHaveBeenCalledWith('验证码校验失败，请重试。')

    await act(async () => callbacks.error?.(new Error('boom')))
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('reports an init timeout when initGeetest4 never calls back', async () => {
    vi.useFakeTimers()
    window.initGeetest4 = vi.fn()
    const { onError } = renderField()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(onError).toHaveBeenCalledWith('验证码初始化超时，请重试。')
  })

  it('rejects untrusted script hosts before loading anything', async () => {
    const { onError } = renderField({
      scriptUrl: 'https://evil.example.com/v4/gt4.js',
    })

    await waitFor(() => expect(onError).toHaveBeenCalledWith('验证码参数无效，请联系管理员。'))
    expect(scriptMock.loadExternalScript).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '点击完成安全验证' })).toBeNull()
  })

  it('destroys the instance and reinitialises when the generation changes', async () => {
    const first = installGeeTest()
    const { rerender } = renderField()
    await waitFor(() => expect(first.init).toHaveBeenCalledTimes(1))

    const second = installGeeTest()
    rerender(
      <GeeTestField
        key={2}
        generation={2}
        captchaId="captcha-id"
        scriptUrl="https://static.geetest.com/v4/gt4.js"
        onProof={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await waitFor(() => expect(second.init).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(first.captcha.destroy).toHaveBeenCalled())
  })
})
