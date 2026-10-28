interface StateBlockProps {
  code: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

/**
 * Page-level empty/error state built from the prototype's `.empty` classes, so a
 * dead end still looks like the rest of the console.
 */
export default function StateBlock({
  code,
  title,
  description,
  actionLabel,
  onAction,
}: StateBlockProps) {
  return (
    <div className="empty" style={{ minHeight: 280 }}>
      <div className="art" style={{ fontSize: 18, fontWeight: 600, letterSpacing: 1 }}>
        {code}
      </div>
      <div className="t">{title}</div>
      <div className="d">{description}</div>
      {actionLabel && onAction ? (
        <button className="btn primary sm" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
