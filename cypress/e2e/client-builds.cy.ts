// Client-build history uses terminal builds seeded by the API devseed tool, so
// this spec never dispatches a real GitHub run.
import { consoleE2EEnabled, openConsole, signIn } from '../support/console'

;(consoleE2EEnabled ? describe : describe.skip)('client builds', () => {
  before(signIn)
  beforeEach(openConsole)

  it('lists seeded builds, filters by status and downloads an artifact', () => {
    cy.contains('.nav-item', '客户端生成器').click()
    cy.location('pathname', { timeout: 10000 }).should('match', /\/builds$/)
    cy.get('.page-title').should('have.text', '客户端生成器')

    cy.contains('构建暂不可发起').should('be.visible')
    cy.contains('button', '新建构建').should('be.disabled')

    cy.get('tbody tr').should('have.length.at.least', 2)
    cy.contains('tbody tr', 'Windows x64, Linux x64').should('exist')

    cy.contains('button.chip-btn', '成功').click()
    cy.location('search').should('contain', 'status=succeeded')
    cy.get('tbody tr').should(($rows) => {
      expect($rows.length).to.be.at.least(1)
      $rows.each((_, row) => expect(row.textContent).to.contain('成功'))
    })

    cy.contains('tbody tr', 'Windows x64, Linux x64').contains('button', '详情').click()
    cy.get('.sheet').should('be.visible')
    cy.get('.sheet').contains('relay.example.com:21117')
    cy.get('.sheet').contains('https://panel.example.com')
    cy.get('.sheet').contains('panel-client-')

    let downloadName = ''
    let blobText: Promise<string> | null = null
    cy.window().then((win) => {
      cy.stub(win.URL, 'createObjectURL').callsFake((blob: Blob) => {
        blobText = blob.text()
        return 'blob:e2e'
      })
      cy.stub(win.URL, 'revokeObjectURL')
      cy.stub(win.HTMLAnchorElement.prototype, 'click').callsFake(function (
        this: HTMLAnchorElement,
      ) {
        downloadName = this.download
      })
    })

    cy.get('.sheet tbody tr').first().contains('button', '下载').click()
    cy.contains('产物已开始下载').should('exist')
    cy.then(() => expect(downloadName).to.match(/\.(AppImage|dmg|apk|zip)$/))
    cy.then(async () => expect(await blobText).to.contain('E2E artifact'))
  })
})
