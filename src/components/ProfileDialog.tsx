import Modal from './Modal'

export default function ProfileDialog({
  email,
  organization,
  role,
  onClose,
  onAccount,
}: {
  email: string
  organization: string
  role: string
  onClose: () => void
  onAccount: () => void
}) {
  return (
    <Modal
      title="个人资料"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" onClick={onClose}>
            关闭
          </button>
          <button className="btn primary" type="button" onClick={onAccount}>
            前往账户安全
          </button>
        </>
      }
    >
      <dl className="desc">
        <dt>邮箱</dt>
        <dd>{email}</dd>
        <dt>当前组织</dt>
        <dd>{organization}</dd>
        <dt>组织角色</dt>
        <dd>{role}</dd>
      </dl>
      <div className="banner info mt-14">
        <div>
          邮箱与姓名编辑尚未开放；如需变更请联系组织
          owner。密码、Passkey、两步验证与外部身份在「账户安全」中管理。
        </div>
      </div>
    </Modal>
  )
}
