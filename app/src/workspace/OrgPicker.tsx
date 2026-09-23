import { X, Plus, ArrowRight, Users, Sparkles, Download } from '../ui/icons'
import { useState } from 'react'
import { useT } from '../i18n/useT'
import { Logo } from '../shell/Logo'
import { Input } from '../ui/Input'
import { useOrgs } from '../state/orgStore'
import { createOrg, deleteOrg, selectOrg, startSampleWorkspace } from '../state/workspaceStore'
import { track } from '../analytics'

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
    // Mobile stacks these as icon-left rows (three 176px columns cannot fit a
    // phone); `md:` restores the centred column the strip was designed as.
    <div className="flex w-full flex-row items-center gap-3 text-left md:w-44 md:flex-col md:gap-1.5 md:text-center">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex flex-col gap-0.5 md:items-center md:gap-1.5">
        <span className="text-sm font-semibold text-base-content">{title}</span>
        <span className="text-xs leading-snug text-base-content/50">{caption}</span>
      </div>
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
      // Reported from the action, not from the store: boot and hydration reach
      // the store functions too, and those are not user actions.
      track('org_created', {})
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
      track('org_created', {})
      track('workspace_created', { template: 'sample' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-base-200 py-4 md:h-full md:p-6">
      <Logo className="mb-6 h-8 w-auto" />

      {firstRun && (
        <div className="mb-6 flex w-full flex-col items-center gap-4 md:mb-8 md:w-auto md:gap-6">
          <p className="m-0 text-xl font-semibold tracking-tight text-base-content">
            {t('workspace.org.introTagline')}
          </p>
          <div className="flex w-full max-w-[420px] flex-col items-stretch gap-3 md:w-auto md:max-w-none md:flex-row md:items-start md:gap-2">
            <Step icon={Users} title={t('workspace.org.step1.title')} caption={t('workspace.org.step1.caption')} />
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-base-content/25 md:mt-2.5 md:block" />
            <Step icon={Sparkles} title={t('workspace.org.step2.title')} caption={t('workspace.org.step2.caption')} />
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-base-content/25 md:mt-2.5 md:block" />
            <Step icon={Download} title={t('workspace.org.step3.title')} caption={t('workspace.org.step3.caption')} />
          </div>
        </div>
      )}

      {mode === 'create' || firstRun ? (
        <div className="w-full max-w-[420px] rounded-lg border border-base-300 bg-base-100 p-5 shadow-lg md:p-8">
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
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <button
                type="submit"
                className="btn btn-primary btn-sm min-h-11 w-full md:min-h-0 md:w-auto"
                disabled={!orgName.trim() || busy}
              >
                {t('workspace.action.create')}
              </button>
              {!firstRun && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm min-h-11 w-full md:min-h-0 md:w-auto"
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
          <div className="mt-6 flex flex-wrap items-start justify-center gap-4 md:mt-8 md:gap-6">
            {orgs.map((o) => (
              <div key={o.id} className="group relative flex w-28 flex-col items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enter(o.id)}
                  className="flex flex-col items-center gap-2 active:opacity-70 md:active:opacity-100"
                >
                  <span className="flex h-24 w-24 items-center justify-center rounded-lg bg-primary/10 text-2xl font-semibold text-primary transition-all duration-150 group-hover:bg-primary/20 group-hover:ring-2 group-hover:ring-primary/40">
                    {initials(o.name)}
                  </span>
                  <span className="w-full truncate text-sm text-base-content/80">{o.name}</span>
                </button>
                {/*
                  One button, two presentations. On touch the hover-revealed
                  corner X is unreachable and its `title` tooltip never shows,
                  so it becomes an in-flow, labelled row under the tile; `md:`
                  puts the 24px corner chip back exactly as it was.
                */}
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t('workspace.org.delete')}
                  title={t('workspace.org.delete')}
                  onClick={() => void remove(o.id)}
                  className="flex min-h-11 w-full items-center justify-center gap-1 rounded-md border border-base-300 text-2xs text-base-content/50 transition-all duration-150 active:bg-base-200 md:absolute md:-right-1 md:-top-1 md:h-6 md:min-h-0 md:w-6 md:rounded-full md:bg-base-100 md:text-xs md:opacity-70 md:hover:border-error md:hover:text-error md:hover:opacity-100 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:focus-visible:outline-none md:focus-visible:ring-2 md:focus-visible:ring-error/40"
                >
                  <X className="h-4 w-4 shrink-0" />
                  <span className="md:hidden">{t('workspace.org.delete')}</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setMode('create')}
              className="group flex w-28 flex-col items-center gap-2 active:opacity-70 md:active:opacity-100"
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
          className="mt-4 inline-flex min-h-11 items-center justify-center px-2 text-sm text-base-content/50 underline-offset-4 transition-colors hover:text-base-content hover:underline disabled:opacity-50 md:mt-5 md:min-h-0 md:px-0"
        >
          {t('workspace.org.sample')}
        </button>
      )}
    </div>
  )
}
