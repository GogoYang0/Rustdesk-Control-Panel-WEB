import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import App from './App'
import { store } from './store'

describe('App', () => {
  it('renders the product title through a Semi Design component', async () => {
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    )

    const titleButton = await screen.findByRole('button', { name: 'Rustdesk-Control-Panel' })
    expect(titleButton).toBeTruthy()
  })
})
