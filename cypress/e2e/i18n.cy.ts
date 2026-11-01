// Locale switching on the authenticated shell and the public login page.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('locale switching', () => {
  before(signIn)
  beforeEach(openConsole)

  function choose(name: string) {
    cy.get('.lang-trigger').click()
    cy.contains('.lang-menu-item', name).click()
  }

  it('switches all five locales and keeps the current route', () => {
    cy.location('pathname').should('match', /\/overview$/)
    choose('English')
    cy.get('html').should('have.attr', 'lang', 'en')
    cy.get('h1.page-title').should('have.text', 'Overview')
    cy.contains('.side-nav .nav-item', 'Device').should('exist')
    cy.location('pathname').should('match', /\/overview$/)

    choose('繁體中文')
    cy.get('h1.page-title').should('have.text', '總覽')
    choose('日本語')
    cy.get('h1.page-title').should('have.text', '概要')
    choose('Русский')
    cy.get('h1.page-title').should('have.text', 'Обзор')
    choose('简体中文')
    cy.get('h1.page-title').should('have.text', '总览')
  })

  it('persists the locale across a reload', () => {
    choose('English')
    cy.get('h1.page-title').should('have.text', 'Overview')
    cy.reload()
    cy.get('html').should('have.attr', 'lang', 'en')
    cy.get('h1.page-title').should('have.text', 'Overview')
    choose('简体中文')
  })

  it('offers the switcher on the public login page', () => {
    cy.clearLocalStorage('rdp-panel-refresh')
    cy.visit('/login')
    cy.get('.lang-switch.floating .lang-trigger').should('exist')
    choose('English')
    cy.contains('button', 'Sign in').should('exist')
    choose('简体中文')
    cy.contains('button', '登录').should('exist')
  })
})
