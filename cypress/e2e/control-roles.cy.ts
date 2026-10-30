// Control roles: create a unique role, edit its matrix, assign the seeded ops
// member, then delete it and verify the member falls back to unassigned.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('control roles', () => {
  before(signIn)
  beforeEach(openConsole)

  let createdName = ''

  afterEach(() => {
    if (!createdName) return
    cy.contains('.nav-item', '控制角色').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/control-roles$/)
    cy.get('body').then(($body) => {
      const row = [...$body.find('tbody tr')].find((tr) => tr.textContent?.includes(createdName))
      if (!row) return
      cy.contains('tbody tr', createdName).contains('button', '删除').click()
      cy.get('.modal').within(() => cy.contains('button', '删除').click())
      cy.contains('tbody tr', createdName).should('not.exist')
    })
    createdName = ''
  })

  it('creates, edits, assigns and deletes a control role', () => {
    const name = `E2E 角色 ${Date.now()}`
    createdName = name
    cy.contains('.nav-item', '控制角色').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/control-roles$/)
    cy.get('.page-title').should('have.text', '控制角色')
    cy.contains('.banner', '原生客户端直连').should('be.visible')

    cy.contains('button', '新建角色').click()
    cy.get('.modal').within(() => {
      cy.get('input[aria-label="名称"]').type(name)
      cy.get('[role=group][aria-label="键盘与鼠标"]').contains('button', '允许').click()
      cy.contains('button', '保存').click()
    })
    cy.contains('tbody tr', name).should('exist')

    cy.contains('tbody tr', name).contains('button', '编辑').click()
    cy.get('.modal').within(() => {
      cy.get('[role=group][aria-label="文件传输"]').contains('button', '拒绝').click()
      cy.contains('button', '保存').click()
    })
    cy.contains('tbody tr', name).contains('允许 1')
    cy.contains('tbody tr', name).contains('拒绝 1')

    cy.get('select[aria-label="控制角色 ops@acme.local"]').select(name)
    cy.get('select[aria-label="控制角色 ops@acme.local"]').invoke('val').should('not.be.empty')

    cy.contains('tbody tr', name).contains('button', '删除').click()
    cy.get('.modal').within(() => cy.contains('button', '删除').click())
    cy.contains('tbody tr', name).should('not.exist')
    cy.get('select[aria-label="控制角色 ops@acme.local"]').should('have.value', '')
    cy.get('select[aria-label="控制角色 ops@acme.local"] option:selected').should(
      'contain',
      '未分配',
    )
    createdName = ''
  })
})
