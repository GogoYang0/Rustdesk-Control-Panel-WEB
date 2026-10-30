import { describe, expect, it, vi } from 'vitest'

import {
  b64urlToBuf,
  bufToB64url,
  prepareCreationOptions,
  prepareRequestOptions,
  serializeAssertionCredential,
  serializeRegistrationCredential,
  webAuthnErrorMessage,
  webAuthnSupported,
  type WebAuthnCredentialLike,
} from './webauthn'

const text = (buffer: ArrayBuffer) => new TextDecoder().decode(new Uint8Array(buffer))

function credential(overrides: Partial<WebAuthnCredentialLike['response']> = {}) {
  const raw = new TextEncoder().encode('credential-id').buffer
  return {
    id: 'credential-id',
    rawId: raw,
    type: 'public-key',
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
    response: {
      clientDataJSON: new TextEncoder().encode('client-data').buffer,
      attestationObject: new TextEncoder().encode('attestation').buffer,
      authenticatorData: new TextEncoder().encode('auth-data').buffer,
      signature: new TextEncoder().encode('signature').buffer,
      userHandle: new TextEncoder().encode('user').buffer,
      getTransports: () => ['internal', 'hybrid'],
      ...overrides,
    },
  } as WebAuthnCredentialLike
}

describe('base64url', () => {
  it('round-trips binary values', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    const encoded = bufToB64url(bytes.buffer)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).not.toContain('=')
    expect(new Uint8Array(b64urlToBuf(encoded))).toEqual(bytes)
  })

  it('decodes missing padding', () => {
    expect(text(b64urlToBuf('YQ'))).toBe('a')
    expect(text(b64urlToBuf('YWI'))).toBe('ab')
    expect(text(b64urlToBuf('YWJj'))).toBe('abc')
  })
})

describe('WebAuthn options', () => {
  it('decodes challenge, user id and exclude credentials for creation', () => {
    const prepared = prepareCreationOptions({
      publicKey: {
        challenge: bufToB64url(new TextEncoder().encode('challenge').buffer),
        user: { id: bufToB64url(new TextEncoder().encode('user').buffer), name: 'a' },
        excludeCredentials: [{ id: bufToB64url(new TextEncoder().encode('exclude').buffer) }],
      },
    })
    expect(text(prepared.challenge as ArrayBuffer)).toBe('challenge')
    expect(text(prepared.user.id as ArrayBuffer)).toBe('user')
    expect(text(prepared.excludeCredentials?.[0].id as ArrayBuffer)).toBe('exclude')
  })

  it('decodes challenge and allow credentials for assertion', () => {
    const prepared = prepareRequestOptions({
      publicKey: {
        challenge: bufToB64url(new TextEncoder().encode('challenge').buffer),
        allowCredentials: [{ id: bufToB64url(new TextEncoder().encode('allow').buffer) }],
      },
    })
    expect(text(prepared.challenge as ArrayBuffer)).toBe('challenge')
    expect(text(prepared.allowCredentials?.[0].id as ArrayBuffer)).toBe('allow')
  })
})

describe('credential serialization', () => {
  it('serializes registration with id/type and transports under response', () => {
    const out = serializeRegistrationCredential(credential())
    expect(out).toMatchObject({
      id: 'credential-id',
      rawId: expect.any(String),
      type: 'public-key',
      response: {
        clientDataJSON: expect.any(String),
        attestationObject: expect.any(String),
        transports: ['internal', 'hybrid'],
      },
    })
    expect(out.clientExtensionResults).toEqual({ credProps: { rk: true } })
  })

  it('serializes assertion including nullable userHandle', () => {
    const out = serializeAssertionCredential(credential())
    expect(out.response.authenticatorData).toEqual(expect.any(String))
    expect(out.response.signature).toEqual(expect.any(String))
    expect(out.response.userHandle).toEqual(expect.any(String))
    const withoutUser = serializeAssertionCredential(credential({ userHandle: null }))
    expect(withoutUser.response.userHandle).toBeNull()
  })

  it('rejects incomplete responses', () => {
    expect(() =>
      serializeRegistrationCredential(credential({ attestationObject: undefined })),
    ).toThrow(/attestationObject/)
    expect(() => serializeAssertionCredential(credential({ signature: undefined }))).toThrow(
      /signature/,
    )
  })
})

describe('support and errors', () => {
  it('reports support only in a secure context with PublicKeyCredential', () => {
    vi.stubGlobal('window', { isSecureContext: true, PublicKeyCredential: function () {} })
    expect(webAuthnSupported()).toBe(true)
    vi.stubGlobal('window', { isSecureContext: false, PublicKeyCredential: function () {} })
    expect(webAuthnSupported()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('maps WebAuthn exceptions to Chinese copy', () => {
    expect(webAuthnErrorMessage(new DOMException('x', 'NotAllowedError'))).toContain('已取消')
    expect(webAuthnErrorMessage(new DOMException('x', 'InvalidStateError'))).toContain('已绑定')
    expect(webAuthnErrorMessage(new DOMException('x', 'SecurityError'))).toContain('不支持')
    expect(webAuthnErrorMessage(new Error('boom'))).toBe('认证失败，请重试')
  })
})
