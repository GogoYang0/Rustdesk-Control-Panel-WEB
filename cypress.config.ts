import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    // Matches the Rsbuild dev server; the console proxies /api to the panel.
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: false,
    // The panel rate-limits password logins; keep one login per spec.
    testIsolation: false,
  },
})
