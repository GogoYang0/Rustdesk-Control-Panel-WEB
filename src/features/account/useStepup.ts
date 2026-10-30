import { useCallback } from 'react'

import { beginPasskeyStepup, finishPasskeyStepup } from '../../lib/api'
import { assertPasskeyCredential, type RequestOptions } from '../../lib/webauthn'

// Sensitive password changes need a fresh assertion even when the session is
// valid; the resulting token is single-use and lives for two minutes.
export function useStepup(): () => Promise<string> {
  return useCallback(async () => {
    const ceremony = await beginPasskeyStepup()
    const credential = await assertPasskeyCredential(ceremony.options as unknown as RequestOptions)
    const stepup = await finishPasskeyStepup({
      ceremony_token: ceremony.ceremony_token,
      credential,
    })
    return stepup.stepup_token
  }, [])
}
