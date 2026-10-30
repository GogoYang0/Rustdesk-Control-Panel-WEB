import { configureStore } from '@reduxjs/toolkit'

import { panelApi } from './api'
import { appReducer } from './appSlice'

export const store = configureStore({
  reducer: {
    app: appReducer,
    [panelApi.reducerPath]: panelApi.reducer,
  },
  // Query errors intentionally carry ApiError so the UI can branch on status
  // and code; the dev-only serializability check would otherwise flag every
  // failed request.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['panelApi/executeQuery/rejected', 'panelApi/executeMutation/rejected'],
        ignoredPaths: [/^panelApi\.(queries|mutations)\..*\.error$/],
      },
    }).concat(panelApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
