import { ChevronDown, Plus } from '../ui/icons'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/useT'
import { BottomSheet } from '../ui/BottomSheet'
import { Input } from '../ui/Input'
import { useIsNarrow } from '../ui/useIsNarrow'
import { useActiveOrg, useActiveOrgWorkspaces, useActiveWorkspaceMeta } from '../state/orgStore'
import { createWorkspace, deleteWorkspace, renameWorkspace, switchWorkspace } from '../state/workspaceStore'

const POPOVER_WIDTH = 264

type Mode = 'list' | 'new-ws' | 'rename'

/**
 * The nav workspace switcher (Slack/Linear style). The trigger shows the entered
 * org + active workspace; the popover lists the workspaces of the CURRENT org
 * (click to switch) and hosts inline forms to create a workspace in this org,
 * rename it, or delete it, plus a "Switch organization" action that returns to
 * the full-page org picker. Org creation lives on the picker, not here — the two
 * selections are deliberately separate.
 *
 * The trigger renders in the rail (`variant="rail"`) or in `BottomNav`'s More
 * sheet (`variant="sheet"`); the body is the same in both. Only its surface
 * forks on touch: a 264px popover anchored under the trigger is fine against a
 * 1280px desktop and half a phone screen, so on mobile the same body opens in a
 * `BottomSheet` instead.
 */
export function WorkspaceSwitcher({ variant = 'rail' }: { variant?: 'rail' | 'sheet' }) {
  const t = useT()
  const isNarrow = useIsNarrow()
  const org = useActiveOrg()
  const activeMeta = useActiveWorkspaceMeta()
  const workspaces = useActiveOrgWorkspaces()

  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ left: number; bottom: number } | null>(null)

  if (!org || !activeMeta) return null

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setRect({ left: r.left, bottom: r.bottom })
    setOpen(true)
  }

  return (
    <div className={variant === 'rail' ? 'flex h-12 items-center border-b border-base-300 px-2' : 'flex w-full'}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('workspace.switcher.aria')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={`flex w-full items-center gap-2 rounded-md border border-base-300 bg-base-100 px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-base-content/30 ${
          variant === 'sheet' ? 'min-h-11' : ''
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-base-content">{activeMeta.name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-base-content/40" aria-hidden />
      </button>
      {isNarrow ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title={t('workspace.switcher.aria')}>
          <SwitcherBody
            orgId={org.id}
            workspaces={workspaces}
            activeId={activeMeta.id}
            activeName={activeMeta.name}
            onClose={() => setOpen(false)}
          />
        </BottomSheet>
      ) : (
        open &&
        rect && (
          <SwitcherPopover
            rect={rect}
            orgId={org.id}
            workspaces={workspaces}
            activeId={activeMeta.id}
            activeName={activeMeta.name}
            onClose={() => setOpen(false)}
          />
        )
      )}
    </div>
  )
}

/** The desktop surface: the same body in a trigger-anchored floating panel. */
function SwitcherPopover({
  rect,
  orgId,
  workspaces,
  activeId,
  activeName,
  onClose,
}: {
  rect: { left: number; bottom: number }
  orgId: string
  workspaces: { id: string; name: string }[]
  activeId: string
  activeName: string
  onClose: () => void
}) {
  useEffect(() => {
    function closeIfOutside(e: MouseEvent) {
      if ((e.target as HTMLElement | null)?.closest('.cd-workspace-switcher')) return
      onClose()
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', closeIfOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)

  return (
    <div
      className="cd-workspace-switcher fixed z-20 flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-3 shadow-lg"
      style={{ left, top: rect.bottom + 6, width: POPOVER_WIDTH }}
    >
      <SwitcherBody
        orgId={orgId}
        workspaces={workspaces}
        activeId={activeId}
        activeName={activeName}
        onClose={onClose}
      />
    </div>
  )
}

/**
 * The switcher's contents, host-agnostic: switching, creating, renaming,
 * deleting and returning to the org picker. Row heights are the desktop ones
 * with a 44px floor below `md`, where the host is always a bottom sheet.
 */
function SwitcherBody({
  orgId,
  workspaces,
  activeId,
  activeName,
  onClose,
}: {
  orgId: string
  workspaces: { id: string; name: string }[]
  activeId: string
  activeName: string
  onClose: () => void
}) {
  const t = useT()
  const [mode, setMode] = useState<Mode>('list')
  const [wsName, setWsName] = useState('')
  const [renameValue, setRenameValue] = useState(activeName)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => unknown) {
    setBusy(true)
    try {
      await fn()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {mode === 'list' && (
        <>
          <ul className="m-0 flex max-h-64 list-none flex-col gap-0.5 overflow-y-auto p-0">
            {workspaces.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => run(() => switchWorkspace(m.id))}
                  disabled={busy}
                  className={`flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm transition-colors duration-150 md:min-h-0 md:py-1 ${
                    m.id === activeId
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-base-content/70 hover:bg-base-200'
                  }`}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 border-t border-base-300 pt-2">
            <button
              type="button"
              onClick={() => setMode('new-ws')}
              className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-sm text-base-content/70 hover:bg-base-200 md:min-h-0 md:py-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('workspace.switcher.newWorkspace')}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenameValue(activeName)
                setMode('rename')
              }}
              className="flex min-h-11 items-center rounded-md px-2 text-left text-sm text-base-content/70 hover:bg-base-200 md:min-h-0 md:py-1"
            >
              {t('workspace.switcher.rename')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('workspace.switcher.deleteConfirm'))) {
                  void run(() => deleteWorkspace(activeId))
                }
              }}
              className="flex min-h-11 items-center rounded-md px-2 text-left text-sm text-error hover:bg-error/10 md:min-h-0 md:py-1"
            >
              {t('workspace.switcher.delete')}
            </button>
          </div>
        </>
      )}

      {mode === 'new-ws' && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (wsName.trim()) void run(() => createWorkspace(orgId, wsName.trim()))
          }}
        >
          <p className="m-0 text-sm font-medium text-base-content">{t('workspace.switcher.newWorkspace')}</p>
          <Input
            autoFocus
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder={t('workspace.create.namePlaceholder')}
            className="w-full"
          />
          <FormActions
            busy={busy}
            canSubmit={wsName.trim().length > 0}
            submitLabel={t('workspace.action.create')}
            onCancel={() => {
              setWsName('')
              setMode('list')
            }}
          />
        </form>
      )}

      {mode === 'rename' && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (renameValue.trim()) void run(() => renameWorkspace(activeId, renameValue.trim()))
          }}
        >
          <p className="m-0 text-sm font-medium text-base-content">{t('workspace.switcher.rename')}</p>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full"
          />
          <FormActions
            busy={busy}
            canSubmit={renameValue.trim().length > 0}
            submitLabel={t('workspace.action.save')}
            onCancel={() => setMode('list')}
          />
        </form>
      )}
    </>
  )
}

function FormActions({
  busy,
  canSubmit,
  submitLabel,
  onCancel,
}: {
  busy: boolean
  canSubmit: boolean
  submitLabel: string
  onCancel: () => void
}) {
  const t = useT()
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className="btn btn-ghost btn-xs min-h-11 md:min-h-0">
        {t('workspace.action.cancel')}
      </button>
      <button type="submit" disabled={!canSubmit || busy} className="btn btn-primary btn-xs min-h-11 md:min-h-0">
        {submitLabel}
      </button>
    </div>
  )
}
