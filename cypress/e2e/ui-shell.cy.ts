// Shell UI polish: header menus close on outside presses, the user menu opens
// account actions, the sidebar footer owns collapse, and page explanations sit
// inside their cards instead of floating under the page.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('console shell UI polish', () => {
  before(signIn)
  beforeEach(openConsole)

  it('closes the organization picker on an outside press', () => {
    cy.get('.org-switch').click()
    cy.get('.org-menu').should('be.visible')
    cy.get('.content').click({ force: true })
    cy.get('.org-menu').should('not.exist')
  })

  it('opens account actions from the user chip', () => {
    cy.get('.user-chip').click()
    cy.get('.user-menu').should('be.visible')
    cy.contains('.user-menu-item', '账户安全').should('exist')
    cy.contains('.user-menu-item', '个人资料').click()
    cy.get('.modal').within(() => {
      cy.contains('个人资料').should('exist')
      cy.contains('button', '关闭').click()
    })
    cy.get('.modal').should('not.exist')
  })

  it('collapses and expands the sidebar from its footer item', () => {
    cy.contains('.side-collapse', '收起侧边栏').click()
    cy.get('.side').should('have.attr', 'data-collapsed', 'true')
    cy.contains('.side-collapse', '展开侧边栏').click()
    cy.get('.side').should('have.attr', 'data-collapsed', 'false')
  })

  it('sweeps the page title and runs the stat-card accent flow', () => {
    cy.get('h1.page-title').should(($title) => {
      expect(getComputedStyle($title[0]).animationName).to.eq('title-sheen')
    })
    cy.get('[data-testid="overview-stat-devices"]').as('stat')
    cy.get('@stat').find('.stat-ring').should('exist')
    cy.get('@stat').find('.stat-icon svg').should('exist')
    cy.get('@stat').find('.stat-spot').should('exist')
    cy.get('@stat').find('.stat-dots').should('exist')
    cy.get('@stat').trigger('pointerenter')
    cy.get('@stat').should('have.attr', 'data-flow', 'on')
    cy.get('@stat').should(($card) => {
      expect(($card[0] as HTMLElement).style.getPropertyValue('--stat-angle')).to.match(/deg$/)
    })
    cy.get('@stat').trigger('pointermove', { clientX: 40, clientY: 30 })
    cy.get('@stat').should(($card) => {
      expect(($card[0] as HTMLElement).style.getPropertyValue('--stat-x')).to.match(/px$/)
      expect(($card[0] as HTMLElement).style.getPropertyValue('--stat-y')).to.match(/px$/)
    })
    cy.get('@stat').trigger('pointerleave')
    cy.get('@stat', { timeout: 5000 }).should('not.have.attr', 'data-flow')
  })

  it('transitions between light and dark themes', () => {
    cy.get('.theme-switch button[title="深色"]').click()
    cy.get('html').should('have.attr', 'data-theme', 'dark')
    cy.get('.theme-switch button[title="浅色"]').click()
    cy.get('html').should('have.attr', 'data-theme', 'light')
  })

  it('uses a circular view transition when motion is allowed', () => {
    cy.window().then((win) => {
      const original = win.matchMedia.bind(win)
      win.matchMedia = ((query: string) =>
        query.includes('prefers-reduced-motion')
          ? ({
              matches: false,
              media: query,
              onchange: null,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
              dispatchEvent() {
                return false
              },
            } as MediaQueryList)
          : original(query)) as typeof win.matchMedia
      const start = win.document.startViewTransition?.bind(win.document)
      if (!start) throw new Error('View Transitions API is not available')
      let calls = 0
      win.document.startViewTransition = ((callback: () => void) => {
        calls += 1
        return start(callback)
      }) as typeof win.document.startViewTransition
      cy.wrap(() => calls).as('viewTransitionCalls')
    })
    cy.get('.theme-switch button[title="深色"]').click()
    cy.get('html').should('have.attr', 'data-theme', 'dark')
    cy.get('@viewTransitionCalls').then((getCalls) => {
      expect((getCalls as unknown as () => number)()).to.eq(1)
    })
    cy.get('.theme-switch button[title="浅色"]').click()
    cy.get('html').should('have.attr', 'data-theme', 'light')
  })

  it('wraps the user email and emphasizes the role', () => {
    cy.viewport(1280, 720)
    cy.get('.user-chip .nm').should(($email) => {
      expect($email.text()).to.contain('@')
    })
    cy.get('.user-chip .rl').should(($role) => {
      const style = getComputedStyle($role[0])
      expect(style.backgroundColor).not.to.eq('rgba(0, 0, 0, 0)')
      expect(style.fontWeight).to.eq('700')
    })
    cy.get('.user-chip .nm').then(($email) => {
      cy.get('.user-chip .rl').then(($role) => {
        expect($role[0].getBoundingClientRect().top).to.be.greaterThan(
          $email[0].getBoundingClientRect().top,
        )
      })
    })
  })

  it('uses circular organization icons and keeps collapse above the footer', () => {
    cy.get('.org-switch').click()
    cy.get('.org-menu-item .org-ava')
      .first()
      .should(($avatar) => {
        expect(getComputedStyle($avatar[0]).borderRadius).to.eq('50%')
      })
    cy.get('.content').click({ force: true })
    cy.get('.side-collapse + .side-foot').should('exist')
  })

  it('shows table skeletons and the top progress bar while a page loads', () => {
    cy.intercept({ method: 'GET', url: /\/api\/v1\/orgs\/\d+\/devices\?/ }, (req) => {
      req.on('response', (res) => res.setDelay(1500))
    }).as('slowDevices')
    cy.contains('.nav-item', '设备').click()
    cy.get('.top-progress').should('have.class', 'on')
    cy.get('.skeleton-table', { timeout: 1500 }).should(($table) => {
      const box = $table[0].getBoundingClientRect()
      expect(box.width).to.be.greaterThan(100)
      expect(box.height).to.be.greaterThan(100)
    })
    cy.wait('@slowDevices')
    cy.get('.skeleton-table').should('not.exist')
    cy.get('.reveal-in').should('have.length.at.least', 2)
    cy.get('.reveal-in')
      .first()
      .should(($el) => {
        expect($el[0].style.getPropertyValue('--reveal-i')).to.eq('0')
      })
    cy.get('.top-progress', { timeout: 4000 }).should('not.have.class', 'on')
  })

  it('covers a form while its dictionaries load', () => {
    cy.intercept('GET', '**/api/v1/orgs/*/roles', (req) => {
      req.on('response', (res) => res.setDelay(1200))
    }).as('slowRoles')
    cy.contains('.nav-item', '组织与成员').click()
    cy.contains('tbody tr', 'ops@acme.local').within(() => {
      cy.contains('button', '改角色').click()
    })
    cy.get('.form-loading').should('exist')
    cy.wait('@slowRoles')
    cy.get('.form-loading').should('not.exist')
    cy.get('.modal').within(() => {
      cy.contains('button', '取消').click()
    })
  })

  it('keeps page explanations inside the card they describe', () => {
    cy.contains('.nav-item', '设备').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/devices$/)
    cy.get('.card-note').contains('停用会拒绝新的认领').should('be.visible')
    cy.get('.page > p.help').should('not.exist')
  })
})
