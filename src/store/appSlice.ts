import { createSlice } from '@reduxjs/toolkit'

export interface AppState {
  title: string
}

const initialState: AppState = {
  title: 'Rustdesk-Control-Panel',
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {},
})

export const appReducer = appSlice.reducer

export const selectTitle = (state: { app: AppState }) => state.app.title
