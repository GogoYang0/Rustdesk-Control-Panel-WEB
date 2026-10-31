// RBAC roles: create a unique custom role, edit its name/permissions/audit
// scope, then delete it. Cleanup re-reads the table in case the edit landed but
// a later assertion failed.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('roles', () => {
  before(signIn)
  beforeEach(openConsole)

  let createdNames: string[] = []

  afterEach(() => {
    const names = createdNames.filter(Boolean)
    if (!names.length) return
    openConsole()
    cy.contains('.nav-item', '角色与权限').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/roles$/)
    names.forEach((name) => {
      cy.get('body').then(($body) => {
        const row = [...$body.find('tbody tr')].find((tr) => tr.textContent?.includes(name))
        if (!row) return
        cy.contains('tbody tr', name).contains('button', '删除').click()
        cy.get('.modal').within(() => cy.contains('button', '删除角色').click())
        cy.contains('tbody tr', name).should('not.exist')
      })
    })
    createdNames = []
  })

  it('creates, edits and deletes a custom role', () => {
    const name = `E2E 角色 ${Date.now()}`
    const edited = `${name} 改`
    createdNames = [name]
    cy.contains('.nav-item', '角色与权限').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/roles$/)
    cy.get('.page-title').should('have.text', '角色与权限')
    cy.contains('button', '新建自定义角色').click()

    cy.get('.modal').within(() => {
      cy.get('input#role-name').type(name)
      cy.contains('label', '设备只读').click()
      cy.contains('label', '全组织审计').click()
      cy.contains('button', '保存').click()
    })
    cy.contains('tbody tr', name).should('exist')
    cy.contains('tbody tr', name).should('contain', '全组织审计')

    cy.contains('tbody tr', name).contains('button', '编辑').click()
    cy.get('.modal').within(() => {
      cy.get('input#role-name').clear().type(edited)
      cy.contains('label', '成员管理').click()
      cy.contains('label', '仅本人相关').click()
      cy.contains('button', '保存').click()
    })
    createdNames = [name, edited]
    cy.contains('tbody tr', edited).should('exist')
    cy.contains('tbody tr', edited).should('contain', '仅本人相关')
    cy.contains('tbody tr', edited).should('contain', '设备只读')
    cy.contains('tbody tr', edited).should('contain', '成员管理')

    cy.contains('tbody tr', edited).contains('button', '删除').click()
    cy.get('.modal').within(() => cy.contains('button', '删除角色').click())
    cy.contains('tbody tr', edited).should('not.exist')
    createdNames = []
  })
})
