// Audit & logs page: tabs, filters and the row-snapshot side sheet. Opt-in like
// the shell spec; the sign-in itself produces the request-audit rows it reads.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('audit & logs', () => {
  before(signIn)
  beforeEach(openConsole)

  it('lists audit rows and opens a row snapshot', () => {
    cy.contains('.nav-item', '审计与日志').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/audit$/)
    cy.get('.page-title').should('have.text', '审计与日志')

    const tabs = '[role=tablist][aria-label="日志类型"] [role=tab]'
    cy.get(tabs).should('have.length', 3)
    cy.get(`${tabs}[aria-selected=true]`).should('contain', '请求审计')
    cy.get(`${tabs}[aria-selected=true]`).should('have.attr', 'aria-controls', 'audit-tabpanel')

    cy.get('[role=tabpanel] tbody tr').should('have.length.at.least', 1)
    cy.get('[role=tabpanel] tbody tr').first().contains('button', '详情').click()
    cy.get('.sheet').should('be.visible')
    cy.get('.sheet').contains('GET /api/')
    cy.get('.sheet-head button[aria-label="关闭"]').click()
    cy.get('.sheet').should('not.exist')
  })

  it('filters by exact action and resets', () => {
    cy.contains('.nav-item', '审计与日志').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/audit$/)

    const action = 'GET /api/v1/orgs/:orgId/members'
    cy.get('input[aria-label="动作"]').clear().type(action, { delay: 0 }).blur()
    cy.location('search').should((search) => {
      expect(new URLSearchParams(search).get('action')).to.eq(action)
    })
    cy.get('[role=tabpanel] tbody tr').should('have.length.at.least', 1)
    cy.get('[role=tabpanel] tbody tr').each(($row) => {
      expect($row.text()).to.contain(action)
    })

    cy.contains('button', '重置筛选').click()
    cy.location('search').should('not.contain', 'action=')
  })

  it('switches tabs and advances the shared range', () => {
    cy.contains('.nav-item', '审计与日志').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/audit$/)

    cy.contains('[role=tablist][aria-label="日志类型"] [role=tab]', '连接日志').click()
    cy.location('search').should('contain', 'tab=connections')
    cy.get('[role=tablist][aria-label="日志类型"] [role=tab][aria-selected=true]').should(
      'have.attr',
      'aria-controls',
      'audit-tabpanel',
    )

    cy.contains('[role=tablist][aria-label="日志类型"] [role=tab]', '文件日志').click()
    cy.location('search').should('contain', 'tab=files')

    cy.contains('button', '30 天').click()
    cy.location('search').should('contain', 'range=30d')
    cy.get('[role=tablist][aria-label="日志类型"] [role=tab]').should('have.length', 3)
  })
})
