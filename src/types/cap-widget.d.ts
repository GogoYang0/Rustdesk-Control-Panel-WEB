import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'cap-widget': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
