import { demoApi } from './demoApi'

// The preload bridge when running in Electron; a read-only stand-in in a plain browser.
export const api = window.scrcpyStudio || demoApi
