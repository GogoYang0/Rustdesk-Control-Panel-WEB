// Organization rename: an owner renames the seeded organization from settings,
// checks the shell (topbar, switcher, page subtitle) updates, then restores the
// original name. The seed resolves organizations by name, so any failed run
// must not leave the renamed value behind; afterEach reloads /me and retries
// the restore from the server's current state.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('organization rename', () => {
  before(signIn)
  beforeEach(openConsole)

  let originalName = ''
  let renamedTo = ''

  function openSettings() {
    cy.contains('.nav-item', '系统设置').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/settings$/)
    cy.get('[data-testid="org-card"]').should('exist')
  }

  function renameTo(name: string) {
    cy.get('[data-testid="org-card"]').within(() => {
      cy.contains('button', '重命名').click()
    })
    cy.get('.modal').within(() => {
      cy.get('input#org-rename-name').clear().type(name)
      cy.contains('button', '保存').click()
    })
    cy.get('[data-testid="org-card"]').should('contain', name)
    cy.get('.org-switch').should('contain', name)
  }

  afterEach(() => {
    if (!renamedTo || !originalName) return
    openConsole()
    openSettings()
    cy.get('[data-testid="org-card"]')
      .invoke('text')
      .then((text) => {
        if (!text.includes(renamedTo)) return
        cy.get('[data-testid="org-card"]').within(() => {
          cy.contains('button', '重命名').click()
        })
        cy.get('.modal').within(() => {
          cy.get('input#org-rename-name').clear().type(originalName)
          cy.contains('button', '保存').click()
        })
        cy.get('[data-testid="org-card"]').should('contain', originalName)
      })
    renamedTo = ''
  })

  it('renames the organization, updates the shell and restores the name', () => {
    openSettings()
    cy.get('[data-testid="org-card"]')
      .invoke('text')
      .then((text) => {
        originalName = text.match(/名称(.+?)组织 id/)?.[1]?.trim() ?? ''
        expect(originalName, 'seeded organization name').not.to.equal('')
        renamedTo = `E2E 重命名 ${Date.now()}`
      })

    cy.then(() => {
      cy.intercept('PATCH', '**/api/v1/orgs/*').as('renameOrg')
      renameTo(renamedTo)
      cy.wait('@renameOrg').its('response.statusCode').should('eq', 200)
      cy.get('.page-sub').should('contain', renamedTo)

      // The switcher reads the same /me cache; opening it proves the patched
      // name reaches the shell without a refetch.
      cy.get('.org-switch').click()
      cy.get('.org-menu-item').contains(renamedTo).should('exist')
      cy.get('.org-scrim').click()

      renameTo(originalName)
      // Cypress queues commands: clearing the marker inside cy.then only runs
      // after the restore assertions pass, so afterEach can still retry.
      cy.then(() => {
        renamedTo = ''
      })
    })
  })
})
