// Allow-only rules: create against a user group, block duplicates, and check
// the default-rule warning without deleting the shared default row.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

const stamp = Date.now().toString().slice(-6)

;(consoleE2EEnabled ? describe : describe.skip)('access rules', () => {
  before(signIn)
  beforeEach(openConsole)

  it('creates and deletes a user-group rule and warns on the default rule', () => {
    const groupName = `E2E 规则组 ${stamp}`

    cy.contains('.nav-item', '访问控制').click()
    cy.contains('[role=tab]', '用户组').click()
    cy.contains('button', '新建用户组').click()
    cy.get('input[aria-label="用户组名称"]').type(groupName)
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', groupName).should('exist')

    cy.contains('[role=tab]', '规则').click()
    cy.contains('tr', '全部设备').should('exist')

    cy.contains('button', '新建规则').click()
    cy.get('select[aria-label="来源用户组"]').select('everyone（所有有效成员）')
    cy.get('#modalRoot .chips').contains('button', '用户组').click()
    cy.get('select[aria-label="目标用户组"]').select(groupName)
    cy.contains('#modalRoot button', '保存').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', groupName).should('exist')

    cy.contains('button', '新建规则').click()
    cy.get('select[aria-label="来源用户组"]').select('everyone（所有有效成员）')
    cy.get('#modalRoot .chips').contains('button', '用户组').click()
    cy.get('select[aria-label="目标用户组"]').select(groupName)
    cy.contains('不能重复创建').should('exist')
    cy.contains('#modalRoot button', '保存').should('be.disabled')
    cy.contains('#modalRoot button', '取消').click()
    cy.get('#modalRoot .mask').should('not.exist')

    cy.contains('tr', groupName).contains('button', '删除').click()
    cy.get('#modalRoot .modal-head').should('contain', '删除访问规则')
    cy.contains('#modalRoot button', '删除').click()
    cy.get('#modalRoot .mask').should('not.exist')
    cy.contains('tr', groupName).should('not.exist')

    cy.contains('tr', '全部设备').contains('button', '删除').click()
    cy.get('#modalRoot .modal').should('contain', '不会自动重建')
    cy.contains('#modalRoot button', '取消').click()
    cy.get('#modalRoot .mask').should('not.exist')

    cy.contains('[role=tab]', '用户组').click()
    cy.contains('tr', groupName).within(() => {
      cy.contains('button', '删除').click()
    })
    cy.contains('#modalRoot button', '删除').click()
    cy.get('#modalRoot .mask').should('not.exist')
  })
})
