// Organization creation through the real API. There is no delete endpoint, so a
// run leaves one organization behind; CI uses a disposable database.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

const stamp = Date.now().toString().slice(-6)
const orgName = `E2E Org ${stamp}`

;(consoleE2EEnabled ? describe : describe.skip)('organization creation', () => {
  before(signIn)

  beforeEach(() => {
    openConsole()
  })

  it('creates an organization and switches to its overview', () => {
    cy.get('.org-switch').click()
    cy.contains('.org-menu button', '创建组织').click()
    cy.get('#modalRoot .modal-head').should('contain', '创建组织')
    cy.get('input[aria-label="组织名称"]').type(orgName)

    cy.intercept('POST', '**/api/v1/orgs').as('createOrg')
    cy.contains('#modalRoot button', '创建组织').click()
    cy.wait('@createOrg').then(({ response }) => {
      if (response?.statusCode === 409) {
        throw new Error(
          '组织配额已满：本地 e2e 数据库的 owner 组织数达到 maxOrgsPerUser，请重建测试库后重跑',
        )
      }
      expect(response?.statusCode).to.eq(201)
    })

    cy.location('pathname', { timeout: 10000 }).should('match', /^\/orgs\/\d+\/overview$/)
    cy.get('.org-switch').should('contain', orgName)
    cy.get('.page-title').should('contain', '总览')

    cy.get('.org-switch').click()
    cy.get('.org-menu').should('contain', orgName)
  })
})
