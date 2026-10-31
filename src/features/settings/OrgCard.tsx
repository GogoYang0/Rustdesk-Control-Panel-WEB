import { useState } from 'react'

import type { MeOrg } from '../../lib/api'
import RenameOrgDialog from './RenameOrgDialog'

export default function OrgCard({ org }: { org: MeOrg }) {
  const [renaming, setRenaming] = useState(false)
  const canRename = org.permissions.includes('org.admin')
  return (
    <div className="card" data-testid="org-card">
      <div className="card-head">
        <div className="card-title">组织</div>
        <div className="hstack" style={{ gap: 8 }}>
          <span className="tag grey">{org.role_kind}</span>
          {canRename ? (
            <button className="btn outline sm" type="button" onClick={() => setRenaming(true)}>
              重命名
            </button>
          ) : null}
        </div>
      </div>
      <div className="card-body">
        <div className="desc">
          <div className="help">名称</div>
          <div>{org.name}</div>
        </div>
        <div className="desc" style={{ marginTop: 10 }}>
          <div className="help">组织 id</div>
          <div className="mono">#{org.id}</div>
        </div>
        <div className="desc" style={{ marginTop: 10 }}>
          <div className="help">当前角色权限</div>
          <div>{org.permissions.length} 项</div>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary className="help">查看权限码</summary>
          <div className="hstack" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {org.permissions.map((code) => (
              <span key={code} className="tag grey mono">
                {code}
              </span>
            ))}
          </div>
        </details>
        <div className="help" style={{ marginTop: 10 }}>
          席位、设备配额与时区尚无 API；此处只展示账户已知的组织信息。
        </div>
      </div>
      {renaming ? <RenameOrgDialog org={org} onClose={() => setRenaming(false)} /> : null}
    </div>
  )
}
