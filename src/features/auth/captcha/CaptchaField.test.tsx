import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CaptchaProof } from '../../../lib/api'
import CaptchaField from './CaptchaField'
import type { CaptchaState } from './useCaptchaChallenge'

vi.mock('./GeeTestField', () => ({
  default: ({ captchaId }: { captchaId: string }) => (
    <div data-testid="geetest-field" data-captcha-id={captchaId} />
  ),
}))

vi.mock('./CapField', () => ({
  default: ({ apiEndpoint }: { apiEndpoint: string }) => (
    <div data-testid="cap-field" data-api-endpoint={apiEndpoint} />
  ),
}))

vi.mock('./AltchaField', () => ({
  default: ({
    generation,
    onProof,
    onExpired,
    onError,
  }: {
    generation: number
    onProof: (proof: CaptchaProof) => void
    onExpired: () => void
    onError: (message: string) => void
  }) => (
    <div>
      <button onClick={() => onProof({ response: { payload: `p-${generation}` } })}>solve</button>
      <button onClick={onExpired}>expire</button>
      <button onClick={() => onError('widget failed')}>fail</button>
    </div>
  ),
}))

function ready(generation = 1, provider = 'altcha'): CaptchaState {
  return { kind: 'ready', generation, provider, params: { challenge: 'c1' } }
}

describe('CaptchaField', () => {
  it('renders nothing when captcha is disabled', () => {
    const { container } = render(
      <CaptchaField
        state={{ kind: 'disabled', generation: 1 }}
        proof={null}
        onProof={vi.fn()}
        onExpired={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows loading, unavailable and unsupported providers', () => {
    const { rerender } = render(
      <CaptchaField
        state={{ kind: 'loading', generation: 1 }}
        proof={null}
        onProof={vi.fn()}
        onExpired={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('正在加载安全验证…')).toBeTruthy()

    const retry = vi.fn()
    rerender(
      <CaptchaField
        state={{ kind: 'unavailable', generation: 2, message: '验证码服务不可用' }}
        proof={null}
        onProof={vi.fn()}
        onExpired={vi.fn()}
        onRetry={retry}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalled()

    rerender(
      <CaptchaField
        state={ready(3, 'other')}
        proof={null}
        onProof={vi.fn()}
        onExpired={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('不支持的验证码提供商')
  })

  it('routes the geetest and cap providers to their fields', async () => {
    const { rerender } = render(
      <CaptchaField
        state={{
          kind: 'ready',
          generation: 4,
          provider: 'geetest',
          params: { captcha_id: 'cid-1', script_url: 'https://static.geetest.com/v4/gt4.js' },
        }}
        proof={null}
        onProof={vi.fn()}
        onExpired={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(await screen.findByTestId('geetest-field')).toHaveAttribute('data-captcha-id', 'cid-1')

    rerender(
      <CaptchaField
        state={{
          kind: 'ready',
          generation: 5,
          provider: 'cap',
          params: { api_endpoint: 'https://cap.example.com/site/', site_key: 'site' },
        }}
        proof={null}
        onProof={vi.fn()}
        onExpired={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(await screen.findByTestId('cap-field')).toHaveAttribute(
      'data-api-endpoint',
      'https://cap.example.com/site/',
    )
  })

  it('rejects provider challenges with missing params', async () => {
    render(
      <CaptchaField
        state={ready(6, 'geetest')}
        proof={null}
        onProof={vi.fn()}
        onExpired={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('验证码参数无效')
    expect(screen.queryByTestId('geetest-field')).toBeNull()
  })

  it('forwards a solved Altcha proof with the current generation', async () => {
    const onProof = vi.fn()
    render(
      <CaptchaField
        state={ready(7)}
        proof={null}
        onProof={onProof}
        onExpired={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'solve' }))
    expect(onProof).toHaveBeenCalledWith(7, { response: { payload: 'p-7' } })
  })

  it('keeps the widget mounted so expiry can still refresh the challenge', async () => {
    const onExpired = vi.fn()
    render(
      <CaptchaField
        state={ready()}
        proof={{ response: { payload: 'p1' } }}
        onProof={vi.fn()}
        onExpired={onExpired}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByTestId('captcha-verified')).toHaveTextContent('安全验证已通过')
    fireEvent.click(await screen.findByRole('button', { name: 'expire' }))
    expect(onExpired).toHaveBeenCalled()
  })

  it('surfaces a widget failure and retries through the challenge refresh', async () => {
    const onRetry = vi.fn()
    render(
      <CaptchaField
        state={ready()}
        proof={null}
        onProof={vi.fn()}
        onExpired={vi.fn()}
        onRetry={onRetry}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'fail' }))
    expect(screen.getByRole('alert')).toHaveTextContent('widget failed')

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(await screen.findByRole('button', { name: 'solve' })).toBeTruthy()
  })
})
