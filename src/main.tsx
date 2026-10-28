import '@douyinfe/semi-ui/react19-adapter'
import '@douyinfe/semi-ui/dist/css/semi.min.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router/dom'

import './styles/global.css'
// Prototype baseline last so its tokens win over Tailwind/Semi resets.
import './styles/prototype.css'
import { bootstrapSession } from './lib/session'
import { router } from './router'
import { store } from './store'

const container = document.getElementById('root')
if (!container) {
  throw new Error('#root container not found')
}

// Refresh first (if a refresh token exists) so the first data request carries an
// access token instead of 401-ing once per page load.
void bootstrapSession().finally(() => {
  createRoot(container).render(
    <StrictMode>
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </StrictMode>,
  )
})
