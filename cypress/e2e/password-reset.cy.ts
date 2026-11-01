// Password reset: the public page consumes a token from the URL fragment
// (never the query string) and clears it before submitting. The admin entry is
// only opened/cancelled here: real reset mails would print their token in the
// dev mailer log, so the mail-issuing path stays in API/Web unit tests.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('password reset', () => {
  before(signIn)
  beforeEach(openConsole)

  it('validates the public reset page and rejects a synthetic token', () => {
    cy.intercept('POST', '**/api/v1/auth/password/reset').as('resetPassword')
    cy.visit('/reset-password#token=synthetic-reset-token-0123456789')
    cy.location('hash').should('eq', '')
    cy.get('input#reset-password').type('new-password')
    cy.get('input#reset-password-confirm').type('different-password')
    cy.contains('button', '设置新密码').click()
    cy.contains('两次输入的密码不一致').should('exist')
    cy.get('input#reset-password-confirm').clear().type('new-password')
    cy.contains('button', '设置新密码').click()
    cy.wait('@resetPassword').its('response.statusCode').should('eq', 409)
    cy.contains(/重置链接无效或已使用/).should('exist')
    cy.contains('a', '去登录').should('exist')
  })

  it('opens the member password reset action without sending mail', () => {
    cy.contains('.nav-item', '组织与成员').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/members$/)
    cy.contains('tbody tr', 'ops@acme.local').contains('button', '安全').click()
    cy.get('.modal').within(() => {
      cy.contains('重置本地密码').should('exist')
      cy.contains('重置本地密码')
        .closest('.card')
        .within(() => cy.contains('button', '重置').click())
      cy.contains(/管理员不会看到新密码/).should('exist')
      cy.contains('button', '返回').click()
      cy.contains('button', '关闭').click()
    })
    cy.get('.modal').should('not.exist')
  })
})
