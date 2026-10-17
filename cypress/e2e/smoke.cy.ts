// M0 占位：端到端用例在 P5（Web 管理台）落地，此处仅固定目录与配置。
describe.skip('M0 skeleton smoke', () => {
  it('loads the admin shell', () => {
    cy.visit('/')
    cy.contains('Rustdesk-Control-Panel')
  })
})
