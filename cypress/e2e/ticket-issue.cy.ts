// Ticket issuance through the real API. The CI seed has no devices, so the
// spec registers the shared fixed RustDesk ID first (an idempotent upsert).
// The issue response's plaintext token must never be printed by the test.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

const stamp = Date.now().toString().slice(-6)

;(consoleE2EEnabled ? describe : describe.skip)('ticket issuance', () => {
  before(signIn)

  beforeEach(() => {
    openConsole()
    cy.contains('.nav-item', '设备').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/devices$/)
  })

  it('issues a one-shot ticket and never shows it again after closing', () => {
    cy.contains('button', '登记设备').click()
    cy.get('input[aria-label="名称"]').clear().type(`E2E ticket ${stamp}`)
    cy.get('input[aria-label="RustDesk ID"]').clear().type('999000123')
    cy.contains('#modalRoot button', '登记').click()
    cy.get('#modalRoot .mask').should('not.exist')

    cy.get('input[aria-label="搜索设备"]').clear().type('999000123')
    cy.contains('button', '查询').click()
    cy.contains('tr', '999000123').within(() => {
      cy.contains('button', '详情').click()
    })

    cy.intercept('POST', '**/api/v1/orgs/*/tickets').as('issueTicket')
    cy.get('.sheet').should('contain', '设备 #')
    cy.contains('.sheet button', '发起连接').click()
    cy.get('#modalRoot .modal-head').should('contain', '发起连接')
    cy.get('#modalRoot select[aria-label="票据有效期"]').select('60')
    cy.contains('#modalRoot button', '签发票据').click()

    cy.wait('@issueTicket').then(({ response }) => {
      expect(response?.statusCode).to.eq(201)
      expect(String(response?.headers['cache-control'])).to.contain('no-store')
    })

    cy.get('[data-testid="ticket-plaintext"]').should(($pre) => {
      // Assert on the shape only: the token itself must not enter the log.
      expect($pre.text().length).to.be.greaterThan(20)
    })
    cy.get('#modalRoot .modal-head').should('contain', '票据已签发')

    cy.get('body').type('{esc}')
    cy.get('[data-testid="ticket-plaintext"]').should('exist')
    cy.contains('#modalRoot button', '我已保存').click()
    cy.get('#modalRoot .mask').should('not.exist')

    cy.contains('tr', '999000123').within(() => {
      cy.contains('button', '详情').click()
    })
    cy.contains('.sheet button', '发起连接').click()
    cy.get('#modalRoot .modal-head').should('contain', '发起连接')
    cy.get('[data-testid="ticket-plaintext"]').should('not.exist')
    cy.contains('#modalRoot button', '取消').click()
    cy.get('#modalRoot .mask').should('not.exist')
  })
})
