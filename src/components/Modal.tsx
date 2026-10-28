import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  width?: number
}

function modalRoot(): HTMLElement {
  let root = document.getElementById('modalRoot')
  if (!root) {
    root = document.createElement('div')
    root.id = 'modalRoot'
    document.body.appendChild(root)
  }
  return root
}

/**
 * Modal rendered through the prototype's own #modalRoot container and classes
 * (.mask/.modal/.modal-*), so dialogs look and behave like the design baseline
 * instead of a component library's dialog.
 */
export default function Modal({ title, children, footer, onClose, width }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
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
    </div>,
    modalRoot(),
  )
}
