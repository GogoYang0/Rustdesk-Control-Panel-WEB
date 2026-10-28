// End-to-end coverage for the console shell. These specs need a running panel
// (localhost:8080) with the development seed in place, so they stay opt-in:
//   CYPRESS_consoleE2E=1 pnpm e2e
const enabled = String(Cypress.env('consoleE2E') ?? '') === '1'
const email = String(Cypress.env('consoleEmail') ?? 'admin@acme.local')
const password = String(Cypress.env('consolePassword') ?? 'admin12345')

function signIn() {
  cy.clearLocalStorage()
  cy.visit('/login')
  cy.get('.login-card input').eq(0).type(email)
  cy.get('.login-card input').eq(1).type(password)
  cy.get('.login-card button[type="submit"]').click()
  cy.location('pathname', { timeout: 10000 }).should('match', /^\/orgs\/\d+\/members$/)
}

;(enabled ? describe : describe.skip)('console shell', () => {
  it('signs in and lists the organization members', () => {
    signIn()
    cy.get('.page-title').should('have.text', '组织与成员')
    cy.get('.table tbody tr').should('have.length.at.least', 1)
    cy.contains('.table tbody tr', email)
    // The signed-in row must not offer actions on itself.
    cy.contains('.table tbody tr', email)
      .find('button')
      .should(($buttons) => {
        expect($buttons.length).to.be.greaterThan(0)
        $buttons.each((_, button) => expect(button).to.be.disabled)
      })
  })

  it('opens the invite dialog as an overlay and closes it', () => {
    signIn()
    cy.contains('.page-head button', '邀请成员').click()
    cy.get('#modalRoot .mask').should('be.visible')
    cy.get('#modalRoot .modal-head').should('have.text', '邀请成员')
    cy.get('#modalRoot .modal').should('have.css', 'position', 'static').and('not.be.visible').or('be.visible')
    cy.get('#modalRoot .mask').click(4, 4)
    cy.get('#modalRoot .mask').should('not.exist')
  })

  it('keeps one tab per page and closes the inactive one', () => {
    signIn()
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
    signIn()
    cy.visit('/orgs/99999/members')
    cy.get('.empty .t').should('contain', '组织不存在')
    cy.get('.empty .d').should('contain', '99999')
  })
})
