// End-to-end coverage for the console shell. These specs need a running panel
// (localhost:8080) with the development seed in place, so they stay opt-in:
//   npx cypress run --expose consoleE2E=true \
//     --env consoleEmail=...,consolePassword=...
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('console shell', () => {
  before(signIn)
  beforeEach(openConsole)

  it('signs in and lists the organization members', () => {
    cy.contains('.nav-item', '组织与成员').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/members$/)
    cy.get('.page-title').should('have.text', '组织与成员')
    cy.get('.table tbody tr').should('have.length.at.least', 1)
    cy.env(['consoleEmail']).then(({ consoleEmail }) => {
      const email = String(consoleEmail ?? 'admin@acme.local')
      cy.contains('.table tbody tr', email)
      // The signed-in row must not offer actions on itself.
      cy.contains('.table tbody tr', email)
        .find('button')
        .should(($buttons) => {
          expect($buttons.length).to.be.greaterThan(0)
          $buttons.each((_, button) => expect(button).to.be.disabled)
        })
    })
  })

  it('opens the invite dialog as an overlay and closes it', () => {
    cy.contains('.nav-item', '组织与成员').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/members$/)
    cy.contains('.page-head button', '邀请成员').click()
    cy.get('#modalRoot .mask').should('be.visible')
    cy.get('#modalRoot .modal-head').should('have.text', '邀请成员')
    cy.get('#modalRoot .mask').should(($mask) => {
      expect(getComputedStyle($mask[0]).position).to.eq('fixed')
    })
    cy.get('#modalRoot .mask').click(4, 4)
    cy.get('#modalRoot .mask').should('not.exist')
  })

  it('opens the mobile drawer and mobile tab navigation', () => {
    cy.viewport(589, 472)
    cy.get('.side').should('have.attr', 'role', 'dialog')
    cy.get('.side').should('have.attr', 'aria-hidden', 'true').and('have.attr', 'inert')

    cy.get('.hamburger').should('be.visible').click()
    cy.get('.side').should('have.class', 'open')
    cy.get('.side').should('have.attr', 'aria-modal', 'true')
    cy.get('.side').should('not.have.attr', 'inert')
    // Focus moves into the dialog; the in-drawer close button needs no route change.
    cy.get('.side .side-close').should('be.focused').click()
    cy.get('.side').should('not.have.class', 'open')
    cy.get('.hamburger').should('be.focused')
    cy.get('.side').should('have.attr', 'inert')

    // Escape also restores focus to the hamburger.
    cy.get('.hamburger').click()
    cy.get('.side .side-close').should('be.focused').type('{esc}')
    cy.get('.side').should('not.have.class', 'open')
    cy.get('.hamburger').should('be.focused')

    // Scrim click closes and restores focus too.
    cy.get('.hamburger').click()
    cy.get('.side .side-close').should('be.focused')
    cy.get('.side-scrim').should('be.visible').click()
    cy.get('.side').should('not.have.class', 'open')
    cy.get('.hamburger').should('be.focused')

    cy.get('.mobtab button').should('have.length', 5)
    cy.contains('.mobtab button', '设备').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/devices$/)
    cy.get('.mobtab button.on').should('contain', '设备')
    cy.get('.page-title').should('have.text', '设备')

    // The close control is a real button but must look like the prototype's span.
    cy.get('.tab-item .tx')
      .first()
      .should(($tx) => {
        const style = getComputedStyle($tx[0])
        expect(style.backgroundColor).to.eq('rgba(0, 0, 0, 0)')
        expect(style.borderTopWidth).to.eq('0px')
      })
    cy.viewport(1280, 720)
    cy.get('.side').should('not.have.attr', 'inert')
    cy.get('.side').should('not.have.attr', 'aria-hidden')
    cy.get('.hamburger').should('not.be.visible')
  })

  it('opens the member security dialog without resetting shared credentials', () => {
    // Stub the destructive endpoints: a regression must fail the zero-request
    // assertion without wiping the shared ops credentials.
    cy.intercept('POST', '**/members/*/2fa/reset', { statusCode: 503 }).as('resetTotp')
    cy.intercept('POST', '**/members/*/passkeys/reset', { statusCode: 503 }).as('resetPasskeys')
    cy.intercept('POST', '**/members/*/identity/reset', { statusCode: 503 }).as('resetIdentity')
    cy.viewport(589, 472)
    cy.get('.hamburger').should('be.visible').click()
    cy.contains('.nav-item', '组织与成员').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/members$/)

    cy.env(['consoleEmail']).then(({ consoleEmail }) => {
      const email = String(consoleEmail ?? 'admin@acme.local')
      cy.contains('tbody tr', email).find('button').contains('安全').should('be.disabled')
    })
    cy.contains('tbody tr', 'ops@acme.local').within(() => {
      cy.contains('button', '安全').should('be.enabled').click()
    })
    cy.get('.modal').within(() => {
      cy.get('.modal-head').should('have.text', '安全重置')
      cy.contains('重置两步验证').should('exist')
      cy.contains('重置 Passkey').should('exist')
      cy.contains('解绑外部身份').should('exist')
      cy.contains('button', '关闭').click()
    })
    cy.get('.modal').should('not.exist')
    cy.get('@resetTotp.all').should('have.length', 0)
    cy.get('@resetPasskeys.all').should('have.length', 0)
    cy.get('@resetIdentity.all').should('have.length', 0)
    cy.viewport(1280, 720)
  })

  it('forwards an OIDC ticket from the root and clears it afterwards', () => {
    cy.visit('/?ticket=invalid-e2e-ticket')
    cy.location('pathname', { timeout: 10000 }).should('eq', '/login')
    cy.location('search').should('not.contain', 'ticket=')
    cy.contains(/SSO (回调已失效|尚未启用)/).should('be.visible')
    cy.get('.login-card input').should('have.length.at.least', 2)
  })

  it('forwards an OIDC callback error from the root to the login page', () => {
    cy.visit('/?error=oidc_failed')
    cy.location('pathname', { timeout: 10000 }).should('eq', '/login')
    cy.contains('SSO 登录失败，请重试或联系管理员').should('be.visible')
    cy.location('search').should('not.contain', 'error=')
  })

  it('keeps one tab per page and closes the inactive one', () => {
    cy.get('.tab-item').should('have.length', 1)
    cy.contains('.nav-item', '角色与权限').click()
    cy.get('.page-title').should('have.text', '角色与权限')
    cy.get('.tab-item').should('have.length', 2)
    cy.get('.tab-item.on').should('contain', '角色与权限')
    cy.get('.tab-item:not(.on) .tx').click()
    cy.get('.tab-item').should('have.length', 1)
    cy.get('.tab-item .tx').should('not.exist')
  })

  it('reports an organization the caller does not belong to', () => {
    cy.visit('/orgs/99999/members')
    cy.get('.empty .t').should('contain', '组织不存在')
    cy.get('.empty .d').should('contain', '99999')
  })
})
