// Organization deletion: devseed keeps a disposable organization with
// provisioning_disabled=true (no containers to clean up). The e2e deletes it
// with the typed-name confirmation; the next seed recreates it. The seed
// organization is never deleted.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('organization deletion', () => {
  before(signIn)
  beforeEach(openConsole)

  const fixture = 'E2E 删除组织'

  it('deletes the disposable organization after typed confirmation', () => {
    cy.get('.org-switch').click()
    cy.contains('.org-menu button', fixture).click()
    cy.location('pathname', { timeout: 10000 }).should('match', /^\/orgs\/\d+\/overview$/)
    cy.get('.org-switch').should('contain', fixture)

    cy.contains('.nav-item', '系统设置').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/settings$/)
    cy.get('[data-testid="org-card"]').within(() => {
      cy.contains('button', '删除组织').click()
    })
    cy.get('.modal').within(() => {
      cy.contains('输入组织名称确认').should('exist')
      cy.get('input[aria-label="确认组织名称"]').type(fixture)
    })
    cy.intercept('DELETE', '**/api/v1/orgs/*').as('deleteOrg')
    cy.get('.modal').within(() => {
      cy.contains('button', '删除组织').click()
    })
    cy.wait('@deleteOrg').its('response.statusCode').should('eq', 200)
    cy.location('pathname', { timeout: 10000 }).should('not.match', /\/settings$/)
    cy.get('.org-switch').should('not.contain', fixture)
  })
})
