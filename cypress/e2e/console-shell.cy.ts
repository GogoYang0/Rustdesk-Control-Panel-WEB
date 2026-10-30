// End-to-end coverage for the console shell. These specs need a running panel
// (localhost:8080) with the development seed in place, so they stay opt-in:
//   npx cypress run --expose consoleE2E=true \
//     --env consoleEmail=...,consolePassword=...
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('console shell', () => {
  before(signIn)
  beforeEach(openConsole)

  it('signs in and lists the organization members', () => {
    cy.contains('.nav-item', '组织与成员').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/members$/)
    cy.get('.page-title').should('have.text', '组织与成员')
    cy.get('.table tbody tr').should('have.length.at.least', 1)
    cy.env(['consoleEmail']).then(({ consoleEmail }) => {
      const email = String(consoleEmail ?? 'admin@acme.local')
      cy.contains('.table tbody tr', email)
      // The signed-in row must not offer actions on itself.
      cy.contains('.table tbody tr', email)
        .find('button')
        .should(($buttons) => {
          expect($buttons.length).to.be.greaterThan(0)
          $buttons.each((_, button) => expect(button).to.be.disabled)
        })
    })
  })

  it('opens the invite dialog as an overlay and closes it', () => {
    cy.contains('.nav-item', '组织与成员').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/members$/)
    cy.contains('.page-head button', '邀请成员').click()
    cy.get('#modalRoot .mask').should('be.visible')
    cy.get('#modalRoot .modal-head').should('have.text', '邀请成员')
    cy.get('#modalRoot .mask').should(($mask) => {
      expect(getComputedStyle($mask[0]).position).to.eq('fixed')
    })
    cy.get('#modalRoot .mask').click(4, 4)
    cy.get('#modalRoot .mask').should('not.exist')
  })

  it('keeps one tab per page and closes the inactive one', () => {
    cy.get('.tab-item').should('have.length', 1)
    cy.contains('.nav-item', '角色与权限').click()
    cy.get('.page-title').should('have.text', '角色与权限')
    cy.get('.tab-item').should('have.length', 2)
    cy.get('.tab-item.on').should('contain', '角色与权限')
    cy.get('.tab-item:not(.on) .tx').click()
    cy.get('.tab-item').should('have.length', 1)
    cy.get('.tab-item .tx').should('not.exist')
  })

  it('reports an organization the caller does not belong to', () => {
    cy.visit('/orgs/99999/members')
    cy.get('.empty .t').should('contain', '组织不存在')
    cy.get('.empty .d').should('contain', '99999')
  })
})
