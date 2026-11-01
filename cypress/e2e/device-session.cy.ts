// Device deletion and session end. The device uses a unique id per run so
// parallel/local reruns do not collide; the session target is the devseed
// fixture (E2E 会话设备), which seed resets to open before each run.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('device deletion and session end', () => {
  before(signIn)
  beforeEach(openConsole)

  it('registers, searches and deletes a device', () => {
    const name = `E2E 删除设备 ${Date.now()}`
    const rid = `77${String(Date.now()).slice(-7)}`
    cy.intercept('POST', '**/api/v1/orgs/*/devices').as('registerDevice')
    cy.intercept('DELETE', '**/api/v1/orgs/*/devices/*').as('deleteDevice')
    cy.contains('.nav-item', '设备').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/devices$/)
    cy.contains('button', '登记设备').click()
    cy.get('.modal').within(() => {
      cy.get('input[aria-label="名称"]').type(name)
      cy.get('input[aria-label="RustDesk ID"]').type(rid)
      cy.contains('button', '登记').click()
    })
    cy.wait('@registerDevice').its('response.statusCode').should('eq', 201)
    cy.get('input[aria-label="搜索设备"]').clear().type(name)
    cy.contains('tbody tr', name)
      .should('exist')
      .within(() => {
        cy.contains('button', '删除').click()
      })
    cy.get('.modal').within(() => {
      cy.contains('删除设备').should('exist')
      cy.contains('button', '删除设备').click()
    })
    cy.wait('@deleteDevice').its('response.statusCode').should('eq', 200)
    cy.contains('tbody tr', name).should('not.exist')
  })

  it('ends the seeded open session', () => {
    cy.intercept('GET', '**/api/v1/orgs/*/sessions*').as('listSessions')
    cy.intercept('POST', '**/api/v1/orgs/*/sessions/*/end').as('endSession')
    cy.contains('.nav-item', '会话').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/sessions$/)
    cy.get('select[aria-label="会话状态"]').select('open')
    cy.wait('@listSessions')
    // The select changes the query key; the previous response can land after
    // the aliased wait and replace (detach) the row. Let it settle first.
    cy.wait(400)
    cy.contains('tbody tr', 'E2E 会话设备')
      .should('exist')
      .within(() => {
        cy.contains('button', '结束').click({ force: true })
      })
    cy.get('.modal').within(() => {
      cy.contains('结束会话').should('exist')
      cy.contains('button', '结束会话').click()
    })
    cy.wait('@endSession').its('response.statusCode').should('eq', 200)
    cy.contains('tbody tr', 'E2E 会话设备').should('not.exist')
  })
})
