// Address-book tags through the real API. Creates a personal book, manages the
// palette, tags a peer, searches by the tag and shows the orphan after removing
// the palette entry. The book is always deleted afterwards.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

const stamp = Date.now().toString().slice(-6)
const bookName = `E2E tags ${stamp}`
const peerId = `e2e-tags-${stamp}`
const tagA = `lab-${stamp}`
const tagB = `finance-${stamp}`

;(consoleE2EEnabled ? describe : describe.skip)('address book tags', () => {
  before(signIn)

  beforeEach(() => {
    openConsole()
    cy.contains('.nav-item', '地址簿').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/address-books$/)
  })

  afterEach(() => {
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

  it('manages the palette, tags a peer, searches by tag and shows orphans', () => {
    cy.contains('button', '新建地址簿').click()
    cy.get('input[aria-label="地址簿名称"]').type(bookName)
    cy.contains('#modalRoot button', '保存').click()
    cy.contains('#modalRoot .mask').should('not.exist')
    cy.contains('.card', bookName).within(() => {
      cy.contains('button', '打开').click()
    })

    cy.contains('button', '标签').click()
    cy.get('#modalRoot .modal-head').should('contain', '管理标签')
    cy.contains('#modalRoot button', '添加标签').click()
    cy.get('input[aria-label="标签名称 1"]').type(tagA)
    cy.contains('#modalRoot button', '添加标签').click()
    cy.get('input[aria-label="标签名称 2"]').type(tagB)
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.get('.page-sub').should('contain', '2 个标签')

    cy.contains('button', '添加 peer').click()
    cy.get('input[aria-label="Peer ID"]').type(peerId)
    cy.contains('.check', tagA).find('input').check()
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', peerId).should('contain', tagA)

    cy.get('input[aria-label="搜索 peer"]').clear().type(tagA)
    cy.contains('tr', peerId).should('exist')
    cy.get('input[aria-label="搜索 peer"]').clear()

    cy.contains('button', '标签').click()
    cy.get('#modalRoot .modal-head').should('contain', '管理标签')
    cy.get('#modalRoot input[aria-label^="标签名称"]')
      .filter((_, element) => (element as HTMLInputElement).value === tagA)
      .closest('.hstack')
      .contains('button', '移除')
      .click()
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.get('.page-sub').should('contain', '1 个标签')

    cy.contains('tr', peerId)
      .find('.tag')
      .should('contain', tagA)
      .and('have.attr', 'title', '未定义标签')
  })
})
