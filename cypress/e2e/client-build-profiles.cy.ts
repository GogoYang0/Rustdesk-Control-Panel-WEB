// Client-build profiles: real API, with a unique name so a rerun never collides
// with data left by an interrupted local run.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('client build profiles', () => {
  before(signIn)
  beforeEach(openConsole)

  let createdName = ''

  afterEach(() => {
    if (!createdName) return
    cy.visit('/')
    cy.contains('.nav-item', '客户端生成器').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/builds$/)
    cy.get('body').then(($body) => {
      const exists = [...$body.find('.card-title')].some(
        (title) => title.textContent === createdName,
      )
      if (!exists) return
      cy.contains('.card', createdName).contains('button', '删除').click()
      cy.get('.modal').within(() => cy.contains('button', '删除').click())
      cy.contains('.card-title', createdName).should('not.exist')
    })
    createdName = ''
  })

  it('creates, edits, brands and deletes a profile', () => {
    const name = `E2E 品牌 ${Date.now()}`
    createdName = name
    cy.contains('.nav-item', '客户端生成器').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/builds$/)
    cy.get('.page-title').should('have.text', '客户端生成器')
    cy.contains(/构建能力已启用|构建暂不可发起/).should('be.visible')

    cy.contains('button', '新建 Profile').click()
    cy.get('.modal').within(() => {
      cy.get('input[aria-label="名称"]').type(name)
      cy.get('input[aria-label="应用名"]').type('E2E Remote')
      cy.contains('button', '保存').click()
    })
    cy.contains('.card-title', name).should('be.visible')

    cy.contains('.card', name).within(() => cy.contains('button', '编辑').click())
    cy.get('.modal').within(() => {
      cy.get('input[aria-label="应用名"]').clear().type('E2E Remote 2')
      cy.contains('button', '保存').click()
    })
    cy.contains('.card', name).contains('应用名 E2E Remote 2')

    cy.contains('.card', name).within(() =>
      cy
        .get(`input[aria-label="上传 Logo ${name}"]`)
        .selectFile('cypress/fixtures/logo-256.png', { force: true }),
    )
    cy.contains('.card', name).contains('Logo 256×256').should('be.visible')
    cy.contains('.card', name)
      .find(`img[alt="${name} Logo"]`)
      .should('have.attr', 'src')
      .and('contain', 'blob:')

    cy.contains('.card', name).contains('button', '移除 Logo').click()
    cy.get('.modal').within(() => cy.contains('button', '移除 Logo').click())
    cy.contains('.card', name).contains('未上传 Logo')

    cy.contains('.card', name).contains('button', '删除').click()
    cy.get('.modal').within(() => cy.contains('button', '删除').click())
    cy.contains('.card-title', name).should('not.exist')
    createdName = ''
  })
})
