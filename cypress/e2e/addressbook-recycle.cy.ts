// Address-book recycle bin through the real API. The CI seed has no books, so
// the spec creates a personal book, exercises delete/restore/purge, and always
// removes the book afterwards.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

const stamp = Date.now().toString().slice(-6)
const bookName = `E2E recycle ${stamp}`
const peerId = `e2e-recycle-${stamp}`

;(consoleE2EEnabled ? describe : describe.skip)('address book recycle bin', () => {
  before(signIn)

  beforeEach(() => {
    openConsole()
    cy.contains('.nav-item', '地址簿').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/address-books$/)
  })

  afterEach(() => {
    // Remove the test book even when the flow failed midway. A missing card is
    // fine: the test may already have deleted it.
    cy.visit('/')
    cy.location('pathname', { timeout: 10000 }).should('match', /\/overview$/)
    cy.contains('.nav-item', '地址簿').click()
    cy.get('body').then(($body) => {
      if (!$body.text().includes(bookName)) return
      cy.contains('.card', bookName).within(() => {
        cy.contains('button', '删除').click()
      })
      cy.contains('#modalRoot button', '删除').click()
      cy.contains('.card', bookName).should('not.exist')
    })
  })

  it('moves a deleted peer to the bin, restores it and purges it', () => {
    cy.contains('button', '新建地址簿').click()
    cy.get('input[aria-label="地址簿名称"]').type(bookName)
    cy.contains('#modalRoot button', '保存').click()
    cy.contains('#modalRoot .mask').should('not.exist')
    cy.contains('.card', bookName).within(() => {
      cy.contains('button', '打开').click()
    })

    cy.contains('button', '添加 peer').click()
    cy.get('input[aria-label="Peer ID"]').type(peerId)
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', peerId).should('exist')

    cy.contains('tr', peerId).within(() => {
      cy.contains('button', '删除').click()
    })
    cy.get('#modalRoot .modal-head').should('contain', '删除 peer')
    cy.contains('#modalRoot button', '删除').click()
    cy.get('#modalRoot .mask').should('not.exist')

    cy.contains('[role=tab]', '回收站').click()
    cy.contains('[data-testid="recycle-row"]', peerId).should('exist')
    cy.contains('[data-testid="recycle-row"]', '剩 30 天').should('exist')

    cy.contains('[data-testid="recycle-row"]', peerId).within(() => {
      cy.get('[data-testid="recycle-restore"]').click()
    })
    cy.contains('[data-testid="recycle-row"]', peerId).should('not.exist')

    cy.contains('[role=tab]', 'Peers').click()
    cy.contains('tr', peerId).should('exist')

    cy.contains('tr', peerId).within(() => {
      cy.contains('button', '删除').click()
    })
    cy.get('#modalRoot .modal-head').should('contain', '删除 peer')
    cy.contains('#modalRoot button', '删除').click()
    cy.contains('[role=tab]', '回收站').click()
    cy.contains('[data-testid="recycle-row"]', peerId).within(() => {
      cy.get('[data-testid="recycle-purge"]').click()
    })
    cy.get('#modalRoot .modal-head').should('contain', '永久删除 peer')
    cy.contains('#modalRoot button', '永久删除').click()
    cy.contains('回收站为空').should('exist')
  })
})
