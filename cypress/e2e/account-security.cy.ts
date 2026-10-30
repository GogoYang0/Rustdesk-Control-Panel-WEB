// Account security: the credentials page is account-level, so it must open for
// any signed-in member without an organization permission. CI runs the panel
// with WebAuthn and SSO disabled, and this spec must never start TOTP enrollment
// on the shared admin account: setup leaves a pending row that blocks password
// removal. Token creation is safe (revoked in cleanup) and exercises the
// one-time plaintext contract.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('account security', () => {
  before(signIn)
  beforeEach(openConsole)

  let createdTokenName = ''

  afterEach(() => {
    const name = createdTokenName
    createdTokenName = ''
    if (!name) return
    openConsole()
    cy.contains('.nav-item', '账户与安全').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/account$/)
    cy.contains('button[role="tab"]', '个人 API Token').click()
    // Wait until the list has actually resolved; a bare body probe can run
    // before the row exists and leak an active token.
    cy.contains('[data-testid="token-activity"]', /活跃 \d+ \/ 20/, { timeout: 10000 })
    cy.get('body').then(($body) => {
      const row = [...$body.find('tbody tr')].find((tr) => tr.textContent?.includes(name))
      if (!row) return
      const revoke = row.querySelector('button')
      if (!revoke) return
      cy.contains('tbody tr', name).contains('button', '撤销').click()
      cy.get('.modal').within(() => cy.contains('button', '撤销').click())
      cy.contains('tbody tr', name).should('contain', '已撤销')
    })
  })

  it('opens the account page, its tabs and the credentials panel', () => {
    cy.contains('.nav-item', '账户与安全').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/account$/)
    cy.get('.page-title').should('have.text', '账户与安全')
    cy.get('#account-panel').should('be.visible')
    cy.get('#account-tab-credentials').should('have.attr', 'aria-selected', 'true')
    cy.contains('button[role="tab"]', '个人 API Token').should('be.enabled')
    cy.contains('button[role="tab"]', '外部身份').should('be.enabled')

    cy.get('[data-testid="totp-card"]').should('contain', '未启用')
    // Enabled, but never clicked: the seed account is shared by every spec and
    // an abandoned enrollment leaves a pending row.
    cy.get('[data-testid="totp-card"]').contains('button', '启用两步验证').should('be.enabled')
    cy.get('[data-testid="passkey-card"]').should('contain', '当前部署未启用 Passkey')
    cy.get('[data-testid="password-card"]').should('contain', '已设置')
    cy.get('[data-testid="password-card"]').contains('button', '删除本地密码').should('be.disabled')
  })

  it('creates a token, shows the plaintext once, copies it and revokes it', () => {
    const name = `E2E Token ${Date.now()}`
    createdTokenName = name
    cy.contains('.nav-item', '账户与安全').click()
    cy.contains('button[role="tab"]', '个人 API Token').click()
    cy.get('[data-testid="token-card"]').should('be.visible')

    cy.contains('button', '创建令牌').click()
    cy.get('.modal').within(() => {
      cy.get('input#token-name').type(name)
      cy.get('input#token-days').clear().type('1')
      cy.contains('button', '创建').click()
    })

    // Never yield the plaintext into the command log: only a shape assertion
    // and a stub-argument check that logs nothing on success.
    cy.get('[data-testid="token-plaintext"]').then(($plaintext) => {
      const value = $plaintext.text().trim()
      expect(value).to.match(/^rdt_/)
      cy.window().then((win) => {
        const stub = cy.stub().resolves()
        Object.defineProperty(win.navigator, 'clipboard', {
          configurable: true,
          value: { writeText: stub },
        })
        cy.contains('button', '复制令牌').click()
        cy.wrap(stub).should('have.been.calledOnce')
        cy.then(() => expect(stub.firstCall.args[0]).to.equal(value))
      })
    })
    cy.contains('button', '我已保存').click()
    cy.get('[data-testid="token-plaintext"]').should('not.exist')

    cy.contains('tbody tr', name).should('contain', '活跃')
    cy.contains('tbody tr', name).contains('button', '撤销').click()
    cy.get('.modal').within(() => cy.contains('button', '撤销').click())
    cy.contains('tbody tr', name).should('contain', '已撤销')
    createdTokenName = ''
  })

  it('validates the token name before sending a create request', () => {
    cy.contains('.nav-item', '账户与安全').click()
    cy.contains('button[role="tab"]', '个人 API Token').click()
    cy.contains('button', '创建令牌').click()
    cy.get('.modal').within(() => {
      cy.contains('button', '创建').click()
      cy.contains('请输入令牌名称').should('be.visible')
    })
    cy.get('.modal').within(() => cy.contains('button', '取消').click())
    cy.get('.modal').should('not.exist')
  })

  it('shows identities disabled and supports deep links to both tabs', () => {
    cy.contains('.nav-item', '账户与安全').click()
    cy.contains('button[role="tab"]', '外部身份').click()
    cy.get('[data-testid="identity-card"]').should('contain', '外部身份未启用')
    cy.get('[data-testid="identity-card"]').should('not.contain', '还没有外部身份绑定')

    cy.location('pathname').then((pathname) => {
      const orgId = String(pathname).match(/^\/orgs\/(\d+)\//)?.[1]
      expect(orgId, 'current organization id').to.match(/^\d+$/)
      cy.visit(`/orgs/${orgId}/account?tab=tokens`)
    })
    cy.get('[data-testid="token-card"]').should('be.visible')
    cy.contains('button[role="tab"]', '个人 API Token').should('have.attr', 'aria-selected', 'true')

    cy.location('pathname').then((pathname) => {
      const orgId = String(pathname).match(/^\/orgs\/(\d+)\//)?.[1]
      cy.visit(`/orgs/${orgId}/account?tab=identities`)
    })
    cy.get('[data-testid="identity-card"]').should('be.visible')
    cy.contains('button[role="tab"]', '外部身份').should('have.attr', 'aria-selected', 'true')
  })
})
