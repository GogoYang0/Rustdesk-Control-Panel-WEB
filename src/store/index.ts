import { configureStore } from '@reduxjs/toolkit'

import { panelApi } from './api'
import { appReducer } from './appSlice'

export const store = configureStore({
  reducer: {
    app: appReducer,
    [panelApi.reducerPath]: panelApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(panelApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
