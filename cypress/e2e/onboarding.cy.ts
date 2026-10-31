// Public onboarding pages: email verification and invitation acceptance. The
// success paths need a real emailed token, which must never enter the Cypress
// command log; they are covered by unit tests and a dev-mailer smoke test.
// These specs exercise routing, URL scrubbing and the real API error contract.
import { consoleE2EEnabled } from '../support/console'

const SYNTHETIC_TOKEN = 'e2e-synthetic-invalid-token-000000'

;(consoleE2EEnabled ? describe : describe.skip)('onboarding pages', () => {
  it('shows the invalid state without a verification token and posts nothing', () => {
    cy.intercept('POST', '**/api/v1/auth/verify-email').as('verify')
    cy.visit('/verify-email')

    cy.get('.login-card h3').should('have.text', '验证邮箱')
    cy.get('[role="alert"]').should('contain', '链接不完整或无效')
    cy.get('@verify.all').should('have.length', 0)
  })

  it('rejects a short verification token locally', () => {
    cy.intercept('POST', '**/api/v1/auth/verify-email').as('verify')
    cy.visit('/verify-email?token=short')

    cy.get('[role="alert"]').should('contain', '链接不完整或无效')
    cy.location('search').should('eq', '')
    cy.get('@verify.all').should('have.length', 0)
  })

  it('maps a rejected verification token and scrubs it from the URL', () => {
    cy.intercept('POST', '**/api/v1/auth/verify-email').as('verify')
    cy.visit(`/verify-email?token=${SYNTHETIC_TOKEN}`)

    cy.wait('@verify').its('response.statusCode').should('eq', 409)
    cy.get('[role="alert"]').should('contain', '已过期或已使用')
    cy.location('search').should('eq', '')
    cy.get('.login-card').should('not.contain', SYNTHETIC_TOKEN)
  })

  it('shows the invalid invitation state without a token', () => {
    cy.visit('/accept-invitation')

    cy.get('.login-card h3').should('have.text', '接受组织邀请')
    cy.get('[role="alert"]').should('contain', '链接不完整或无效')
    cy.get('#invite-password').should('not.exist')
  })

  it('blocks a mismatched password locally and maps a dead invitation token', () => {
    cy.intercept('GET', '**/api/v1/auth/captcha').as('captcha')
    cy.intercept('POST', '**/api/v1/invitations/accept').as('accept')
    cy.visit(`/accept-invitation?token=${SYNTHETIC_TOKEN}`)

    cy.wait('@captcha')
    cy.get('#invite-password').should('not.be.disabled').type('password-1')
    cy.get('#invite-confirm').type('password-2')
    cy.get('.login-card button[type="submit"]').click()
    cy.get('[role="alert"]').should('contain', '两次输入的密码不一致')
    cy.get('@accept.all').should('have.length', 0)
    cy.get('#invite-confirm').clear().type('password-1')
    cy.get('.login-card button[type="submit"]').click()

    cy.wait('@accept').its('response.statusCode').should('eq', 409)
    cy.get('[role="alert"]').should('contain', '无效、已过期或已被使用')
    cy.location('search').should('eq', '')
    cy.get('#invite-password').should('not.exist')
  })
})
