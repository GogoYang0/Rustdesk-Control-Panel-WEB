// Account security: the credentials page is account-level, so it must open for
// any signed-in member without an organization permission. CI runs the panel
// with WebAuthn disabled, and this spec must never start TOTP enrollment on the
// shared admin account: setup leaves a pending row that blocks password removal.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('account security', () => {
  before(signIn)
  beforeEach(openConsole)

  it('opens the account page from the navigation without a permission gate', () => {
    cy.contains('.nav-item', '账户与安全').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/account$/)
    cy.get('.page-title').should('have.text', '账户与安全')
    cy.get('#account-panel-credentials').should('be.visible')
    cy.get('#account-tab-credentials').should('have.attr', 'aria-selected', 'true')
    cy.contains('#account-tab-tokens', '个人 API Token').should('be.disabled')
    cy.contains('#account-tab-identities', '外部身份').should('be.disabled')

    cy.get('[data-testid="totp-card"]').should('contain', '未启用')
    // Enabled, but never clicked: the seed account is shared by every spec and
    // an abandoned enrollment leaves a pending row.
    cy.get('[data-testid="totp-card"]').contains('button', '启用两步验证').should('be.enabled')

    cy.get('[data-testid="passkey-card"]').should('contain', '当前部署未启用 Passkey')
    cy.get('[data-testid="passkey-card"]').contains('button', '添加 Passkey').should('be.disabled')

    cy.get('[data-testid="password-card"]').should('contain', '已设置')
    cy.get('[data-testid="password-card"]').contains('button', '删除本地密码').should('be.disabled')
  })

  it('supports a direct deep link to the account page', () => {
    cy.location('pathname').then((pathname) => {
      const orgId = String(pathname).match(/^\/orgs\/(\d+)\//)?.[1]
      expect(orgId, 'current organization id').to.match(/^\d+$/)
      cy.visit(`/orgs/${orgId}/account`)
    })
    cy.get('.page-title').should('have.text', '账户与安全')
    cy.get('[data-testid="totp-card"]').should('be.visible')
    cy.get('[data-testid="passkey-card"]').should('be.visible')
    cy.get('[data-testid="password-card"]').should('be.visible')
  })
})
