import '@douyinfe/semi-ui/react19-adapter'
import '@douyinfe/semi-ui/dist/css/semi.min.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router/dom'

import './styles/global.css'
import { router } from './router'
import { store } from './store'

const container = document.getElementById('root')
if (!container) {
  throw new Error('#root container not found')
}

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
)
