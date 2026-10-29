// Access-control groups: user membership and device assignment through the
// real API. Device groups are exercised with a device registered in the UI
// because the CI seed does not create devices.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

const stamp = Date.now().toString().slice(-6)

;(consoleE2EEnabled ? describe : describe.skip)('access control groups', () => {
  before(signIn)

  beforeEach(() => {
    openConsole()
    cy.contains('.nav-item', '访问控制').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/access$/)
  })

  it('creates, renames and deletes a user group with a member', () => {
    const name = `E2E 用户组 ${stamp}`
    const renamed = `${name} 改名`

    cy.contains('[role=tab]', '用户组').click()
    cy.contains('button', '新建用户组').click()
    cy.get('input[aria-label="用户组名称"]').type(name)
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', name).should('exist')

    cy.contains('tr', name).within(() => {
      cy.contains('button', '成员').click()
    })
    cy.get('#modalRoot .modal-head').should('contain', '编辑成员')
    cy.contains('.check', 'ops@acme.local').find('input').check()
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', name).should('contain', '1 人')

    cy.contains('tr', name).within(() => {
      cy.contains('button', '重命名').click()
    })
    cy.get('input[aria-label="用户组名称"]').clear().type(renamed)
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', renamed).should('exist')

    cy.contains('tr', renamed).within(() => {
      cy.contains('button', '删除').click()
    })
    cy.get('#modalRoot .modal-head').should('contain', '删除用户组')
    cy.contains('#modalRoot button', '删除').click()
    cy.contains('tr', renamed).should('not.exist')
  })

  it('assigns a registered device to a device group and releases it', () => {
    const groupName = `E2E 设备组 ${stamp}`

    cy.contains('.nav-item', '设备').click()
    cy.location('pathname').should('match', /\/devices$/)
    cy.contains('button', '登记设备').click()
    cy.get('input[aria-label="名称"]').clear().type(`E2E device ${stamp}`)
    cy.get('input[aria-label="RustDesk ID"]').clear().type('999000123')
    cy.contains('#modalRoot button', '登记').click()
    cy.contains('tr', '999000123').should('exist')

    cy.contains('.nav-item', '访问控制').click()
    cy.contains('[role=tab]', '设备组').click()
    cy.contains('button', '新建设备组').click()
    cy.get('input[aria-label="设备组名称"]').type(groupName)
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', groupName).should('exist')

    cy.contains('tr', groupName).within(() => {
      cy.contains('button', '设备').click()
    })
    cy.contains('.check', '999000123').find('input').check()
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', groupName).find('td').eq(1).should('have.text', '1')

    cy.contains('tr', groupName).within(() => {
      cy.contains('button', '设备').click()
    })
    cy.contains('.check', '999000123').find('input').uncheck()
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', groupName).find('td').eq(1).should('have.text', '0')

    cy.contains('tr', groupName).within(() => {
      cy.contains('button', '删除').click()
    })
    cy.get('#modalRoot .modal-head').should('contain', '删除设备组')
    cy.contains('#modalRoot button', '删除').click()
    cy.contains('tr', groupName).should('not.exist')
  })
})
