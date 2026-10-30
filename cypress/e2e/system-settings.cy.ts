// System settings: owner-only read view. Provisioning toggles real containers
// and retention changes the shared org's cleanup policy, so this spec only
// reads; write paths are covered by unit tests.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('system settings', () => {
  before(signIn)
  beforeEach(openConsole)

  function stateLabel(state: string): string {
    switch (state) {
      case 'disabled':
        return '未启用'
      case 'pending':
        return '等待部署'
      case 'provisioning':
        return '部署中'
      case 'deployed':
        return '已部署'
      case 'failed':
        return '部署失败'
      default:
        return state
    }
  }

  function assertCards() {
    cy.get('[data-testid="org-card"]').invoke('text').should('match', /#\d+/)
    cy.get('[data-testid="provisioning-state"]')
      .invoke('text')
      .should('match', /未启用|等待部署|部署中|已部署|部署失败/)
    cy.get('[data-testid="provisioning-card"]').contains('button', '刷新').should('be.enabled')
    cy.get('[data-testid="retention-value"]')
      .invoke('text')
      .should('match', /永久保留|保留 \d+ 天/)
    cy.get('[data-testid="provider-oidc-status"]')
      .invoke('text')
      .should('match', /已启用|未启用/)
    cy.get('[data-testid="provider-ldap-status"]')
      .invoke('text')
      .should('match', /已启用|未启用/)
  }

  it('opens the settings page from the navigation and renders API values', () => {
    cy.intercept('GET', '**/api/v1/orgs/*/provisioning').as('provisioning')
    cy.intercept('GET', '**/api/v1/orgs/*/audit-retention').as('retention')
    cy.intercept('GET', '**/api/v1/auth/providers').as('providers')
    cy.contains('.nav-item', '系统设置').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/settings$/)
    cy.get('.page-title').should('have.text', '系统设置')
    cy.wait(['@provisioning', '@retention', '@providers']).then(([prov, ret, provs]) => {
      const provisioning = prov.response?.body.data
      const retention = ret.response?.body.data
      const providers = provs.response?.body.data
      cy.get('[data-testid="provisioning-state"]').should(
        'have.text',
        stateLabel(provisioning.state),
      )
      cy.get('[data-testid="provisioning-card"] [role="switch"]').should(
        'have.attr',
        'aria-checked',
        String(provisioning.enabled),
      )
      cy.get('[data-testid="retention-value"]').should(
        'have.text',
        retention.audit_retention_days === 0
          ? '永久保留'
          : `保留 ${retention.audit_retention_days} 天`,
      )
      cy.get('[data-testid="provider-oidc-status"]').should(
        'have.text',
        providers.oidc.enabled ? '已启用' : '未启用',
      )
      cy.get('[data-testid="provider-ldap-status"]').should(
        'have.text',
        providers.ldap.enabled ? '已启用' : '未启用',
      )
    })
    assertCards()
    // Never toggle provisioning: this would deploy or tear down real containers.
    cy.get('[data-testid="provisioning-card"]')
      .find('button[role="switch"][aria-label="允许服务器供应"]')
      .should('exist')
  })

  it('supports a direct deep link to settings', () => {
    cy.location('pathname').then((pathname) => {
      const orgId = String(pathname).match(/^\/orgs\/(\d+)\//)?.[1]
      expect(orgId, 'current organization id').to.match(/^\d+$/)
      cy.visit(`/orgs/${orgId}/settings`)
    })
    cy.get('.page-title').should('have.text', '系统设置')
    assertCards()
  })
})
