// Overview is the new landing page. It is read-only: four totals are the
// server's `total` from the same list endpoints the full pages use, so this
// spec compares the UI against intercepted responses rather than seeding data.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

const numberFormat = new Intl.NumberFormat('zh-CN')

;(consoleE2EEnabled ? describe : describe.skip)('overview', () => {
  before(signIn)
  beforeEach(openConsole)

  it('lands on overview and renders the four API totals', () => {
    cy.intercept('GET', '**/api/v1/orgs/*/devices?*').as('devices')
    cy.intercept('GET', '**/api/v1/orgs/*/sessions?*').as('sessions')
    cy.intercept('GET', '**/api/v1/orgs/*/approvals?*').as('approvals')
    cy.intercept('GET', '**/api/v1/orgs/*/alerts?*').as('alerts')
    cy.visit('/')
    cy.location('pathname', { timeout: 10000 }).should('match', /\/overview$/)
    cy.get('.page-title').should('have.text', '总览')
    cy.get('.nav-item.active').should('contain', '总览')

    cy.wait(['@devices', '@sessions', '@approvals', '@alerts']).then(
      ([devices, sessions, approvals, alerts]) => {
        const deviceTotal = devices.response?.body.data.total
        const sessionTotal = sessions.response?.body.data.total
        const approvalTotal = approvals.response?.body.data.total
        const alertTotal = alerts.response?.body.data.total

        cy.get('[data-testid="overview-stat-devices"]').should(
          'contain',
          numberFormat.format(deviceTotal),
        )
        cy.get('[data-testid="overview-stat-sessions"]').should(
          'contain',
          numberFormat.format(sessionTotal),
        )
        cy.get('[data-testid="overview-stat-approvals"]').should(
          'contain',
          numberFormat.format(approvalTotal),
        )
        cy.get('[data-testid="overview-stat-alerts"]').should(
          'contain',
          numberFormat.format(alertTotal),
        )
      },
    )

    cy.get('body').should('not.contain', '未处置告警')
    cy.get('[data-testid="overview-sessions"]').should('exist')
    cy.get('[data-testid="overview-approvals"]').should('exist')
    cy.get('[data-testid="overview-alerts"]').should('exist')
  })

  it('supports a direct deep link and all-history view links', () => {
    cy.location('pathname').then((pathname) => {
      const orgId = String(pathname).match(/^\/orgs\/(\d+)\//)?.[1]
      expect(orgId, 'current organization id').to.match(/^\d+$/)
      cy.visit(`/orgs/${orgId}/overview`)
    })
    cy.get('.page-title').should('have.text', '总览')
    cy.get('[data-testid="overview-stat-devices"]').should('be.visible')
    cy.get('[data-testid="overview-stat-sessions"]').should('be.visible')
    cy.get('[data-testid="overview-stat-approvals"]').should('be.visible')
    cy.get('[data-testid="overview-stat-alerts"]').should('be.visible')
    cy.location('pathname').then((pathname) => {
      const orgId = String(pathname).match(/^\/orgs\/(\d+)\//)?.[1]
      cy.get(`a[href="/orgs/${orgId}/sessions?status=open&range=all"]`).should('exist')
      cy.get(`a[href="/orgs/${orgId}/approvals?status=pending"]`).should('exist')
      cy.get('[data-testid="overview-alerts"]').contains('a', '查看全部').click()
      cy.location('pathname', { timeout: 10000 }).should('eq', `/orgs/${orgId}/alerts`)
      cy.location('search').should('contain', 'range=all')
      cy.get('.page-title').should('have.text', '告警中心')
    })
  })
})
