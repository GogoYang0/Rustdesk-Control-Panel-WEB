// The server sends W3C WebAuthn options with base64url binary fields; the
// browser only accepts ArrayBuffers, and credentials travel back the other way.

export interface WebAuthnCredentialLike {
  id: string
  rawId: ArrayBuffer
  type: string
  getClientExtensionResults?: () => Record<string, unknown>
  response: {
    clientDataJSON: ArrayBuffer
    attestationObject?: ArrayBuffer
    authenticatorData?: ArrayBuffer
    signature?: ArrayBuffer
    userHandle?: ArrayBuffer | null
    getTransports?: () => string[]
  }
}

export function b64urlToBuf(value: string): ArrayBuffer {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

export function bufToB64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let raw = ''
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface CredentialDescriptor {
  id: string | ArrayBuffer
  [key: string]: unknown
}

export interface CreationOptions {
  publicKey: {
    challenge: string | ArrayBuffer
    user: { id: string | ArrayBuffer; [key: string]: unknown }
    excludeCredentials?: CredentialDescriptor[]
    [key: string]: unknown
  }
}

export interface RequestOptions {
  publicKey: {
    challenge: string | ArrayBuffer
    allowCredentials?: CredentialDescriptor[]
    [key: string]: unknown
  }
}

function descriptorToBuffer(
  descriptor: CredentialDescriptor,
): CredentialDescriptor & { id: ArrayBuffer } {
  return {
    ...descriptor,
    id: typeof descriptor.id === 'string' ? b64urlToBuf(descriptor.id) : descriptor.id,
  }
}

export function prepareCreationOptions(
  options: CreationOptions,
): PublicKeyCredentialCreationOptions {
  const publicKey = {
    ...options.publicKey,
    challenge: b64urlToBuf(String(options.publicKey.challenge)),
    user: {
      ...options.publicKey.user,
      id: b64urlToBuf(String(options.publicKey.user.id)),
    },
    excludeCredentials: (options.publicKey.excludeCredentials ?? []).map(descriptorToBuffer),
  }
  return publicKey as unknown as PublicKeyCredentialCreationOptions
}

export function prepareRequestOptions(options: RequestOptions): PublicKeyCredentialRequestOptions {
  const publicKey = {
    ...options.publicKey,
    challenge: b64urlToBuf(String(options.publicKey.challenge)),
    allowCredentials: (options.publicKey.allowCredentials ?? []).map(descriptorToBuffer),
  }
  return publicKey as unknown as PublicKeyCredentialRequestOptions
}

function extensions(credential: WebAuthnCredentialLike): Record<string, unknown> {
  try {
    return credential.getClientExtensionResults?.() ?? {}
  } catch {
    return {}
  }
}

export function serializeRegistrationCredential(credential: WebAuthnCredentialLike) {
  const response = credential.response
  if (!response.attestationObject)
    throw new Error('registration response is missing attestationObject')
  return {
    id: credential.id,
    rawId: bufToB64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: extensions(credential),
    response: {
      clientDataJSON: bufToB64url(response.clientDataJSON),
      attestationObject: bufToB64url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  }
}

export function serializeAssertionCredential(credential: WebAuthnCredentialLike) {
  const response = credential.response
  if (!response.authenticatorData || !response.signature) {
    throw new Error('assertion response is missing authenticatorData or signature')
  }
  return {
    id: credential.id,
    rawId: bufToB64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: extensions(credential),
    response: {
      clientDataJSON: bufToB64url(response.clientDataJSON),
      authenticatorData: bufToB64url(response.authenticatorData),
      signature: bufToB64url(response.signature),
      userHandle: response.userHandle ? bufToB64url(response.userHandle) : null,
    },
  }
}

export function webAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof window.PublicKeyCredential !== 'undefined'
  )
}

export function webAuthnErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError') return '已取消或超时，请重试'
  if (name === 'InvalidStateError') return '该凭据已绑定到其他账户'
  if (name === 'SecurityError' || name === 'NotSupportedError') {
    return '当前浏览器不支持 Passkey，或页面不在安全上下文'
  }
  return '认证失败，请重试'
}

export async function createPasskeyCredential(
  options: CreationOptions,
): Promise<ReturnType<typeof serializeRegistrationCredential>> {
  if (!webAuthnSupported() || !navigator.credentials?.create) {
    throw new DOMException('WebAuthn unavailable', 'NotSupportedError')
  }
  const credential = await navigator.credentials.create({
    publicKey: prepareCreationOptions(options),
  })
  if (!credential) throw new DOMException('cancelled', 'NotAllowedError')
  return serializeRegistrationCredential(credential as unknown as WebAuthnCredentialLike)
}

export async function assertPasskeyCredential(
  options: RequestOptions,
): Promise<ReturnType<typeof serializeAssertionCredential>> {
  if (!webAuthnSupported() || !navigator.credentials?.get) {
    throw new DOMException('WebAuthn unavailable', 'NotSupportedError')
  }
  const credential = await navigator.credentials.get({ publicKey: prepareRequestOptions(options) })
  if (!credential) throw new DOMException('cancelled', 'NotAllowedError')
  return serializeAssertionCredential(credential as unknown as WebAuthnCredentialLike)
}
