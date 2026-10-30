// Shared opt-in gate and sign-in for console e2e specs. Public flags use
// Cypress.expose (Cypress 16 removed Cypress.env); the seeded credentials are
// sensitive and go through cy.env so they stay out of the command log.
export const consoleE2EEnabled = Cypress.expose('consoleE2E') === true

const LANDING_PATH = /^\/orgs\/\d+\/overview$/

/**
 * Signs in once per spec. Test isolation stays off so a spec logs in only once.
 * The panel allows 5 password attempts per minute per IP, which one login per
 * spec can exceed as the suite grows; a 429 waits for the bucket to refill and
 * retries instead of failing a functional spec for a rate limit.
 */
function attemptLogin(email: string, password: string, retriesLeft: number) {
  cy.get('.login-card input').eq(0).clear().type(email)
  cy.get('.login-card input').eq(1).clear().type(password, { log: false })
  // The submit button stays disabled until the captcha challenge resolves,
  // even when the deployment disables captcha.
  cy.get('.login-card button[type="submit"]').should('not.be.disabled').click()
  cy.wait('@loginAttempt', { timeout: 15000 }).then(({ response }) => {
    if (response?.statusCode === 429 && retriesLeft > 0) {
      cy.wait(15000)
      cy.visit('/login')
      attemptLogin(email, password, retriesLeft - 1)
      return
    }
    if (response?.statusCode !== 200) {
      throw new Error(`login failed with ${response?.statusCode}`)
    }
    cy.location('pathname', { timeout: 10000 }).should('match', LANDING_PATH)
  })
}

export function signIn() {
  cy.env(['consoleEmail', 'consolePassword']).then(({ consoleEmail, consolePassword }) => {
    const email = String(consoleEmail ?? 'admin@acme.local')
    const password = String(consolePassword ?? 'admin12345')

    cy.clearLocalStorage()
    cy.intercept('GET', '**/api/v1/auth/captcha').as('captchaProbe')
    cy.intercept('POST', '**/api/v1/auth/login').as('loginAttempt')
    cy.visit('/login')
    // Rsbuild compiles the login chunk on the first request; the default 5s
    // wait can expire before the app has even mounted.
    cy.wait('@captchaProbe', { timeout: 15000 })
    attemptLogin(email, password, 2)
  })
}

/** Loads the console entry, which redirects to the first organization. */
export function openConsole() {
  cy.visit('/')
  cy.location('pathname', { timeout: 10000 }).should('match', LANDING_PATH)
}
