// Collected logs page: the sample hbbs/hbbr events come from tools/devseed in
// the panel API, so e2e never depends on real collected log lines.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('log collection', () => {
  before(signIn)
  beforeEach(openConsole)

  it('lists seeded events, filters by level and opens the raw line', () => {
    cy.intercept('GET', '**/log-events**').as('logs')
    cy.contains('.nav-item', '日志采集').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/logs$/)
    cy.get('.page-title').should('have.text', '日志采集')

    cy.wait('@logs').then(({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('since')).not.to.equal(null)
      expect(url.searchParams.get('limit')).to.equal('50')
    })

    cy.get('tbody tr').should('have.length.at.least', 4)
    cy.get('tbody tr').first().contains('INFO connection closed')
    cy.contains('tbody tr', 'ERROR relay unreachable').should('exist')
    cy.contains('tbody tr', 'WARN file transfer path=/tmp/report.csv').should('exist')

    cy.contains('button.chip-btn', '错误').click()
    cy.location('search').should('contain', 'level=error')
    cy.wait('@logs').then(({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('level')).to.equal('error')
      expect(url.searchParams.get('since')).not.to.equal(null)
    })
    cy.get('tbody tr').each(($row) => expect($row.text()).to.contain('错误'))
    cy.contains('tbody tr', 'ERROR relay unreachable').contains('button', '详情').click()

    cy.get('.sheet').should('be.visible')
    cy.get('.sheet').contains('ERROR relay unreachable')
    cy.get('.sheet').contains('错误')
    cy.get('.sheet-head button[aria-label="关闭"]').click()
    cy.get('.sheet').should('not.exist')
  })

  it('keeps level and range filters across a reload and resets them', () => {
    cy.contains('.nav-item', '日志采集').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/logs$/)

    cy.contains('button.chip-btn', '警告').click()
    cy.contains('button.chip-btn', '30 天').click()
    cy.location('search').should((search) => {
      expect(search).to.contain('level=warn')
      expect(search).to.contain('range=30d')
    })

    cy.reload()
    cy.location('search').should((search) => {
      expect(search).to.contain('level=warn')
      expect(search).to.contain('range=30d')
    })
    cy.get('tbody tr').should('have.length.at.least', 1)
    cy.get('tbody tr').each(($row) => expect($row.text()).to.contain('警告'))

    cy.contains('button', '重置筛选').click()
    cy.location('search').should('equal', '')
    cy.get('tbody tr').should('have.length.at.least', 4)
  })
})
