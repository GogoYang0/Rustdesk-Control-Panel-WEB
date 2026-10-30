// Client strategies: create a unique strategy, assign the seeded ops member,
// clear the assignment, disable it, then delete it.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('client strategies', () => {
  before(signIn)
  beforeEach(openConsole)

  let createdName = ''
  let originalStrategy = ''

  afterEach(() => {
    const name = createdName
    const initialStrategy = originalStrategy
    if (!name) return
    openConsole()
    cy.contains('.nav-item', '客户端策略').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/strategies$/)
    cy.get('select[aria-label="策略 ops@acme.local"]')
      .should('exist')
      .then(($select) => {
        if ($select.val() !== initialStrategy) {
          cy.wrap($select).select(initialStrategy)
        }
      })
    cy.get('body').then(($body) => {
      const row = [...$body.find('tbody tr')].find((tr) => tr.textContent?.includes(name))
      if (!row) return
      cy.contains('tbody tr', name).contains('button', '删除').click()
      cy.get('.modal').within(() => cy.contains('button', '删除').click())
      cy.contains('tbody tr', name).should('not.exist')
    })
    createdName = ''
    originalStrategy = ''
  })

  it('creates, assigns, disables and deletes a client strategy', () => {
    const name = `E2E 策略 ${Date.now()}`
    cy.contains('.nav-item', '客户端策略').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/strategies$/)
    cy.get('.page-title').should('have.text', '客户端策略')
    cy.get('select[aria-label="策略 ops@acme.local"]')
      .invoke('val')
      .then((value) => {
        originalStrategy = String(value ?? '')
        createdName = name
      })

    cy.contains('button', '新建策略').click()
    cy.get('.modal').within(() => {
      cy.get('input[aria-label="名称"]').type(name)
      cy.get('input[aria-label="下发 启用声音"]').check()
      cy.contains('button', '保存').click()
    })
    cy.contains('tbody tr', name).contains('1')

    cy.intercept('PUT', '**/members/2/strategy').as('assign')
    cy.get('select[aria-label="策略 ops@acme.local"]').select(name)
    cy.wait('@assign')
    cy.get('select[aria-label="策略 ops@acme.local"]').invoke('val').should('not.be.empty')

    cy.get('select[aria-label="策略 ops@acme.local"]').select('')
    cy.get('select[aria-label="策略 ops@acme.local"]').should('have.value', '')

    cy.contains('tbody tr', name).contains('button', '编辑').click()
    cy.get('.modal').within(() => {
      cy.get('input[aria-label="启用策略"]').uncheck()
      cy.contains('button', '保存').click()
    })
    cy.contains('tbody tr', name).contains('停用')

    cy.contains('tbody tr', name).contains('button', '删除').click()
    cy.get('.modal').within(() => cy.contains('button', '删除').click())
    cy.contains('tbody tr', name).should('not.exist')
  })
})
