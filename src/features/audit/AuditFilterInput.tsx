import { useEffect, useRef, useState } from 'react'

/**
 * Text filter with a local draft. Writing the URL on every keystroke both
 * fires a query per character and can drop characters when the controlled
 * value round-trips through navigation; commit on blur/Enter or after idle.
 */
export default function AuditFilterInput({
  label,
  value,
  maxLength,
  placeholder,
  width,
  onCommit,
}: {
  label: string
  value: string
  maxLength: number
  placeholder?: string
  width: number
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const committed = useRef(value)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  useEffect(() => {
    setDraft(value)
    committed.current = value
  }, [value])

  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => {
      if (draft === committed.current) return
      committed.current = draft
      commitRef.current(draft)
    }, 400)
    return () => clearTimeout(timer)
  }, [draft, value])

  function commit() {
    if (draft === committed.current) return
    committed.current = draft
    commitRef.current(draft)
  }

  return (
    <div className="input" style={{ width }}>
      <input
        aria-label={label}
        maxLength={maxLength}
        placeholder={placeholder}
        value={draft}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
