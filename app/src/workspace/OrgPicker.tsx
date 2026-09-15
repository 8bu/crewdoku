import { X, Plus, ArrowRight, Users, Sparkles, Download } from '../ui/icons'
import { useState } from 'react'
import { useT } from '../i18n/useT'
import { Logo } from '../shell/Logo'
import { Input } from '../ui/Input'
import { useOrgs } from '../state/orgStore'
import { createOrg, deleteOrg, selectOrg, startSampleWorkspace } from '../state/workspaceStore'

/** Up to two initials for an org avatar tile. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return '?'
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? first
  return (first.charAt(0) + last.charAt(0)).toUpperCase()
}

/** One step in the first-run "how it works" strip: icon, verb, short caption. */
function Step({ icon: Icon, title, caption }: { icon: typeof Users; title: string; caption: string }) {
  return (
    <div className="flex w-36 flex-col items-center gap-1.5 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold text-base-content">{title}</span>
      <span className="text-xs text-base-content/50">{caption}</span>
    </div>
  )
}

/**
 * The full-page organization picker (Netflix "who's watching" style). It is the
 * first screen when no org is entered: a grid of org tiles to enter, plus an
 * "add organization" tile. On a truly fresh install (no orgs) it opens straight
 * on the create-organization form. Entering an org drops into that org's most
 * recent workspace, or the create-workspace screen when the org is empty.
 */
export function OrgPicker() {
  const t = useT()
  const orgs = useOrgs()
  const firstRun = orgs.length === 0
  const [mode, setMode] = useState<'pick' | 'create'>(firstRun ? 'create' : 'pick')
  const [orgName, setOrgName] = useState('')
  const [busy, setBusy] = useState(false)

  async function enter(orgId: string) {
    setBusy(true)
    try {
      await selectOrg(orgId)
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    const name = orgName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const org = createOrg(name)
      await selectOrg(org.id)
    } finally {
      setBusy(false)
    }
  }

  async function remove(orgId: string) {
    if (busy || !window.confirm(t('workspace.org.deleteConfirm'))) return
    setBusy(true)
    try {
      await deleteOrg(orgId)
    } finally {
      setBusy(false)
    }
  }

  async function startSample() {
    if (busy) return
    setBusy(true)
    try {
      await startSampleWorkspace()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-base-200 p-6">
      <Logo className="mb-6 h-8 w-auto" />

      {firstRun && (
        <div className="mb-8 flex flex-col items-center gap-6">
          <p className="m-0 text-xl font-semibold tracking-tight text-base-content">
            {t('workspace.org.introTagline')}
          </p>
          <div className="flex items-start gap-2">
            <Step icon={Users} title={t('workspace.org.step1.title')} caption={t('workspace.org.step1.caption')} />
            <ArrowRight className="mt-2.5 h-4 w-4 shrink-0 text-base-content/25" />
            <Step icon={Sparkles} title={t('workspace.org.step2.title')} caption={t('workspace.org.step2.caption')} />
            <ArrowRight className="mt-2.5 h-4 w-4 shrink-0 text-base-content/25" />
            <Step icon={Download} title={t('workspace.org.step3.title')} caption={t('workspace.org.step3.caption')} />
          </div>
        </div>
      )}

      {mode === 'create' || firstRun ? (
        <div className="w-full max-w-[420px] rounded-lg border border-base-300 bg-base-100 p-8 shadow-lg">
          <h1 className="m-0 text-lg font-semibold tracking-tight text-base-content">
            {firstRun ? t('workspace.org.createFirstTitle') : t('workspace.org.newTitle')}
          </h1>
          {firstRun && (
            <p className="m-0 mt-1 text-sm text-base-content/60">{t('workspace.org.createFirstSubtitle')}</p>
          )}
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">
                {t('workspace.org.nameLabel')}
              </span>
              <Input
                autoFocus
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={t('workspace.org.namePlaceholder')}
                className="w-full"
              />
            </label>
            <div className="flex items-center gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={!orgName.trim() || busy}>
                {t('workspace.action.create')}
              </button>
              {!firstRun && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setOrgName('')
                    setMode('pick')
                  }}
                >
                  {t('workspace.action.cancel')}
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <div className="w-full max-w-[760px] text-center">
          <h1 className="m-0 text-xl font-semibold tracking-tight text-base-content">
            {t('workspace.org.pickTitle')}
          </h1>
          <p className="m-0 mt-1 text-sm text-base-content/60">{t('workspace.org.pickSubtitle')}</p>
          <div className="mt-8 flex flex-wrap items-start justify-center gap-6">
            {orgs.map((o) => (
              <div key={o.id} className="group relative flex w-28 flex-col items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enter(o.id)}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="flex h-24 w-24 items-center justify-center rounded-lg bg-primary/10 text-2xl font-semibold text-primary transition-all duration-150 group-hover:bg-primary/20 group-hover:ring-2 group-hover:ring-primary/40">
                    {initials(o.name)}
                  </span>
                  <span className="w-full truncate text-sm text-base-content/80">{o.name}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t('workspace.org.delete')}
                  title={t('workspace.org.delete')}
                  onClick={() => void remove(o.id)}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-base-300 bg-base-100 text-xs text-base-content/50 opacity-70 transition-all duration-150 hover:border-error hover:text-error hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40 group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setMode('create')}
              className="group flex w-28 flex-col items-center gap-2"
            >
              <span className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-base-300 text-3xl text-base-content/40 transition-colors duration-150 group-hover:border-base-content/40 group-hover:text-base-content/60">
                <Plus className="h-8 w-8" />
              </span>
              <span className="w-full text-sm text-base-content/60">{t('workspace.org.add')}</span>
            </button>
          </div>
        </div>
      )}

      {firstRun && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startSample()}
          className="mt-5 text-sm text-base-content/50 underline-offset-4 transition-colors hover:text-base-content hover:underline disabled:opacity-50"
        >
          {t('workspace.org.sample')}
        </button>
      )}
    </div>
  )
}
