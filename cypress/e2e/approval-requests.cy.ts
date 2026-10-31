// Approval creation through the real API. The CI seed has no devices, so the
// spec registers a fixed RustDesk ID first (Register is an idempotent upsert);
// the same device is used by access-control.cy.ts.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

const stamp = Date.now().toString().slice(-6)

;(consoleE2EEnabled ? describe : describe.skip)('approval requests', () => {
  before(signIn)

  beforeEach(() => {
    openConsole()
    cy.contains('.nav-item', '设备').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/devices$/)
  })

  it('requests a pre-approval and opens the created request in the center', () => {
    cy.contains('button', '登记设备').click()
    cy.get('input[aria-label="名称"]').clear().type(`E2E approval ${stamp}`)
    cy.get('input[aria-label="RustDesk ID"]').clear().type('999000123')
    cy.contains('#modalRoot button', '登记').click()
    cy.get('#modalRoot .mask').should('not.exist')

    cy.get('input[aria-label="搜索设备"]').clear().type('999000123')
    cy.contains('button', '查询').click()
    cy.contains('tr', '999000123').within(() => {
      cy.contains('button', '详情').click()
    })

    cy.get('.sheet').should('contain', '设备 #')
    cy.contains('.sheet button', '申请审批').click()
    cy.get('#modalRoot .modal-head').should('contain', '申请事前审批')
    cy.get('textarea[aria-label="申请理由"]').type('E2E 变更窗口需要连接')
    cy.contains('#modalRoot button', '提交审批').click()

    cy.get('[data-testid="approval-request-result"]')
      .should('contain', '事前审批')
      .and('contain', '待审批')
    cy.get('[data-testid="approval-request-result"]').invoke('text').should('match', /#\d+/)
    cy.get('[data-testid="approval-request-link"]').click()

    cy.location('pathname', { timeout: 10000 }).should('match', /\/approvals$/)
    cy.location('search').should('contain', 'approvalId=')
    cy.get('.sheet').should('contain', '事前审批').and('contain', '待审批')
  })
})
