// Shell UI polish: header menus close on outside presses, the user menu opens
// account actions, the sidebar footer owns collapse, and page explanations sit
// inside their cards instead of floating under the page.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('console shell UI polish', () => {
  before(signIn)
  beforeEach(openConsole)

  it('closes the organization picker on an outside press', () => {
    cy.get('.org-switch').click()
    cy.get('.org-menu').should('be.visible')
    cy.get('.content').click({ force: true })
    cy.get('.org-menu').should('not.exist')
  })

  it('opens account actions from the user chip', () => {
    cy.get('.user-chip').click()
    cy.get('.user-menu').should('be.visible')
    cy.contains('.user-menu-item', '账户安全').should('exist')
    cy.contains('.user-menu-item', '个人资料').click()
    cy.get('.modal').within(() => {
      cy.contains('个人资料').should('exist')
      cy.contains('button', '关闭').click()
    })
    cy.get('.modal').should('not.exist')
  })

  it('collapses and expands the sidebar from its footer item', () => {
    cy.contains('.side-collapse', '收起侧边栏').click()
    cy.get('.side').should('have.attr', 'data-collapsed', 'true')
    cy.contains('.side-collapse', '展开侧边栏').click()
    cy.get('.side').should('have.attr', 'data-collapsed', 'false')
  })

  it('sweeps the page title and runs the stat-card accent flow', () => {
    cy.get('h1.page-title').should(($title) => {
      expect(getComputedStyle($title[0]).animationName).to.eq('title-sheen')
    })
    cy.get('[data-testid="overview-stat-devices"]').as('stat')
    cy.get('@stat').find('.stat-ring').should('exist')
    cy.get('@stat').trigger('pointerenter')
    cy.get('@stat').should('have.attr', 'data-flow', 'on')
    cy.get('@stat').should(($card) => {
      expect(($card[0] as HTMLElement).style.getPropertyValue('--stat-angle')).to.match(/deg$/)
    })
    cy.get('@stat').trigger('pointerleave')
    cy.get('@stat').should('not.have.attr', 'data-flow', { timeout: 5000 })
    cy.get('@stat').should(($card) => {
      expect(($card[0] as HTMLElement).style.getPropertyValue('--stat-angle')).to.eq('0.00deg')
    })
  })

  it('transitions between light and dark themes', () => {
    cy.get('.theme-switch button[title="深色"]').click()
    cy.get('html').should('have.class', 'theme-switching')
    cy.get('html').should('have.attr', 'data-theme', 'dark')
    cy.get('html', { timeout: 2000 }).should('not.have.class', 'theme-switching')
    cy.get('.theme-switch button[title="浅色"]').click()
    cy.get('html').should('have.attr', 'data-theme', 'light')
  })

  it('keeps page explanations inside the card they describe', () => {
    cy.contains('.nav-item', '设备').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/devices$/)
    cy.get('.card-note').contains('停用会拒绝新的认领').should('be.visible')
    cy.get('.page > p.help').should('not.exist')
  })
})
