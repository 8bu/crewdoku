import { useState } from 'react'
import { useT } from '../i18n/useT'
import { Logo } from '../shell/Logo'
import { Input } from '../ui/Input'
import { useActiveOrg } from '../state/orgStore'
import { createWorkspace, leaveOrg } from '../state/workspaceStore'
import { track } from '../analytics'

/**
 * Shown when an org is entered but has no workspace yet (fresh org, or the last
 * workspace was deleted). The org is already chosen on the picker, so this asks
 * only for the workspace name. Creating it flips `activeWorkspaceId`, dropping
 * into the normal routed shell (and the per-workspace roster onboarding). "Back
 * to organizations" returns to the full-page picker.
 */
export function WorkspaceCreate() {
  const t = useT()
  const org = useActiveOrg()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  if (!org) return null
  const orgId = org.id
  const canSubmit = name.trim().length > 0 && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      await createWorkspace(orgId, name.trim())
      // 'starter': this path seeds the generic starter catalog, not a named
      // workspace template.
      track('workspace_created', { template: 'starter' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-base-200 py-4 md:h-full md:p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-base-300 bg-base-100 p-5 shadow-lg md:p-8">
        <Logo className="mb-6 h-7 w-auto" />
        <h1 className="m-0 text-lg font-semibold tracking-tight text-base-content">
          {t('workspace.create.title')}
        </h1>
        <p className="m-0 mt-1 text-sm text-base-content/60">
          {t('workspace.create.subtitle', { org: org.name })}
        </p>
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">
              {t('workspace.create.nameLabel')}
            </span>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('workspace.create.namePlaceholder')}
              className="w-full"
            />
          </label>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <button
              type="submit"
              className="btn btn-primary btn-sm min-h-11 w-full md:min-h-0 md:w-auto"
              disabled={!canSubmit}
            >
              {t('workspace.create.submit')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm min-h-11 w-full md:min-h-0 md:w-auto"
              onClick={() => void leaveOrg()}
            >
              {t('workspace.create.back')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
