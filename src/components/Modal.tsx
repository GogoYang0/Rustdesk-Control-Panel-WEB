import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  width?: number
}

/**
 * Modal built from the prototype's own classes (`.mask/.modal/.modal-*`) rather
 * than a component library dialog, so the console keeps one visual language.
 */
export default function Modal({ title, children, footer, onClose, width }: ModalProps) {
  return (
    <div className="mask" onClick={onClose}>
      <div
        className="modal"
        style={width ? { width } : undefined}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  )
}
