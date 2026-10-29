// Shared opt-in gate and sign-in for console e2e specs. Public flags use
// Cypress.expose (Cypress 16 removed Cypress.env); the seeded credentials are
// sensitive and go through cy.env so they stay out of the command log.
export const consoleE2EEnabled = Cypress.expose('consoleE2E') === true

/**
 * Signs in once per spec. The config disables test isolation so the session
 * survives between tests; specs call signIn in `before` and visit `/` in
 * `beforeEach` to start from the first organization. Repeating a password
 * login per test trips the panel's login rate limit.
 */
export function signIn() {
  cy.env(['consoleEmail', 'consolePassword']).then(({ consoleEmail, consolePassword }) => {
    const email = String(consoleEmail ?? 'admin@acme.local')
    const password = String(consolePassword ?? 'admin12345')

    cy.clearLocalStorage()
    cy.visit('/login')
    cy.get('.login-card input').eq(0).type(email)
    cy.get('.login-card input').eq(1).type(password)
    cy.get('.login-card button[type="submit"]').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /^\/orgs\/\d+\/members$/)
  })
}

/** Loads the console entry, which redirects to the first organization. */
export function openConsole() {
  cy.visit('/')
  cy.location('pathname', { timeout: 10000 }).should('match', /^\/orgs\/\d+\/members$/)
}
