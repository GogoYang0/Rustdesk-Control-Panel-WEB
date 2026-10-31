// Pending invitations: devseed keeps one pending fixture whose plaintext token
// was discarded, so this spec never creates a real invitation (the dev mailer
// would print its token) and never reads mail. Revoking the fixture is the
// expected state; the next seed recreates it.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('pending invitations', () => {
  before(signIn)
  beforeEach(openConsole)

  const seededEmail = 'e2e-invite@example.com'

  function openMembers() {
    cy.contains('.nav-item', '组织与成员').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/members$/)
    cy.get('[data-testid="invitation-card"]').should('exist')
  }

  function revokeRow() {
    cy.get('[data-testid="invitation-card"]').within(() => {
      cy.contains('tr', seededEmail).contains('button', '撤销').click()
    })
    cy.get('.modal').within(() => {
      cy.contains(seededEmail).should('exist')
      cy.contains('button', '撤销邀请').click()
    })
    cy.get('[data-testid="invitation-card"]').contains(seededEmail).should('not.exist')
  }

  afterEach(() => {
    // Best effort: a failed test may leave the fixture pending. Revoking it is
    // harmless because devseed removes and recreates the fixture on every run.
    openConsole()
    openMembers()
    cy.get('[data-testid="invitation-card"]')
      .invoke('text')
      .then((text) => {
        if (!text.includes(seededEmail)) return
        revokeRow()
      })
  })

  it('revokes the seeded pending invitation', () => {
    openMembers()
    cy.intercept('DELETE', '**/api/v1/orgs/*/invitations/*').as('revokeInvitation')
    cy.get('[data-testid="invitation-card"]').within(() => {
      cy.contains('tr', seededEmail).should('exist')
      cy.contains('tr', seededEmail).should('contain', 'Member')
      cy.contains('tr', seededEmail).contains('button', '撤销').click()
    })
    cy.get('.modal').within(() => {
      cy.contains(seededEmail).should('exist')
      cy.contains('button', '撤销邀请').click()
    })
    cy.wait('@revokeInvitation').its('response.statusCode').should('eq', 200)
    cy.get('[data-testid="invitation-card"]').contains(seededEmail).should('not.exist')
  })
})
