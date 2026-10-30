// Runs only against the captcha-enabled API instance started after the normal
// e2e suite (see .github/workflows/e2e.yml). It is outside cypress/e2e so the
// default suite never hits a disabled captcha by accident.
import { consoleE2EEnabled } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('altcha login', () => {
  function login(email: string, password: string) {
    cy.get('.login-card input').eq(0).clear().type(email)
    cy.get('.login-card input').eq(1).clear().type(password, { log: false })
    cy.get('[data-testid="captcha-verified"]', { timeout: 30000 }).should(
      'contain',
      '安全验证已通过',
    )
    cy.get('.login-card button[type="submit"]').should('not.be.disabled').click()
  }

  it('signs in after solving a real Altcha challenge', () => {
    cy.env(['consoleEmail', 'consolePassword']).then(({ consoleEmail, consolePassword }) => {
      cy.intercept('GET', '**/api/v1/auth/captcha').as('captchaChallenge')
      cy.intercept('POST', '**/api/v1/auth/login').as('loginAttempt')
      cy.clearLocalStorage()
      cy.visit('/login')

      cy.wait('@captchaChallenge')
        .its('response.body.data')
        .should('include', { enabled: true, provider: 'altcha' })
      login(String(consoleEmail), String(consolePassword))
      cy.wait('@loginAttempt').its('response.statusCode').should('eq', 200)
      cy.location('pathname', { timeout: 10000 }).should('match', /\/orgs\/\d+\/overview$/)
    })
  })

  it('refreshes the challenge after a wrong password and then succeeds', () => {
    cy.env(['consoleEmail', 'consolePassword']).then(({ consoleEmail, consolePassword }) => {
      cy.intercept('GET', '**/api/v1/auth/captcha').as('captchaChallenge')
      cy.intercept('POST', '**/api/v1/auth/login').as('loginAttempt')
      cy.clearLocalStorage()
      cy.visit('/login')
      cy.wait('@captchaChallenge')

      login(String(consoleEmail), 'definitely-wrong-password')
      cy.wait('@loginAttempt').its('response.statusCode').should('eq', 401)
      cy.get('.login-card').should('contain', '邮箱或密码不正确')
      cy.wait('@captchaChallenge')
      cy.get('[data-testid="captcha-verified"]', { timeout: 30000 }).should(
        'contain',
        '安全验证已通过',
      )

      cy.get('.login-card input').eq(1).clear().type(String(consolePassword), { log: false })
      cy.get('.login-card button[type="submit"]').click()
      cy.wait('@loginAttempt').its('response.statusCode').should('eq', 200)
      cy.location('pathname', { timeout: 10000 }).should('match', /\/orgs\/\d+\/overview$/)
    })
  })
})
