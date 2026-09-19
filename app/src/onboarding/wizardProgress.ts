/**
 * Resumable first-run wizard progress (harden-the-wizard ticket). The wizard
 * is three steps of small decisions, and until now any reload - a phone
 * locking, an accidental refresh, a crash on the paste step - threw all of
 * them away and dropped the manager back on "Company shape" with an empty
 * textarea. This module remembers the three inputs that are worth keeping
 * (`step`, `templateId`, `pasteText`) so a reload lands exactly where the
 * manager left off.
 *
 * Device-scoped, like the theme and locale: whose screen this is belongs to
 * the person looking at it, while the workspace blob is shared content that
 * gets exported. Keyed per workspace so two workspaces never inherit each
 * other's half-finished setup, and every operation is a no-op without a
 * workspace id (the picker can render before a workspace exists).
 *
 * `step` and `templateId` are plain strings here, not the component's `Step`
 * or `TemplateId` union: `Onboarding.tsx` imports this module, so importing
 * its types back would be a cycle. `Onboarding` narrows the restored strings
 * against its own step list and template catalog, which is also where the
 * "step without a template" combination is rejected.
 */
export type WizardProgress = {
  /** One of `Onboarding`'s step keys; validated by the reader. */
  step: string
  /** A workspace template id, or null when no shape was picked yet. */
  templateId: string | null
  /** The People step's raw textarea contents. */
  pasteText: string
}

export const WIZARD_PROGRESS_KEY_PREFIX = 'crewdoku-onboarding-progress'

function progressKey(wsId: string | null): string | null {
  return wsId ? `${WIZARD_PROGRESS_KEY_PREFIX}:${wsId}` : null
}

/**
 * The saved progress, or null when there is none to trust. Anything that is
 * not exactly the expected shape (an older format, a hand-edited entry, a
 * quota-truncated write) reads as "no progress" rather than a half-restored
 * wizard.
 */
export function loadWizardProgress(wsId: string | null): WizardProgress | null {
  const key = progressKey(wsId)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { step, templateId, pasteText } = parsed as Record<string, unknown>
    if (typeof step !== 'string') return null
    if (templateId !== null && typeof templateId !== 'string') return null
    if (typeof pasteText !== 'string') return null
    return { step, templateId, pasteText }
  } catch {
    // Unreadable or unparsable storage is treated as "no progress saved".
    return null
  }
}

export function saveWizardProgress(wsId: string | null, p: WizardProgress): void {
  const key = progressKey(wsId)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(p))
  } catch {
    // A locked-down browser (private mode, blocked storage, full quota) must
    // never break the wizard: progress is a convenience, not the setup.
  }
}

/** Forgets the saved progress - the wizard's exits call this so a completed
 *  setup can never be replayed by a later reload. */
export function clearWizardProgress(wsId: string | null): void {
  const key = progressKey(wsId)
  if (!key) return
  try {
    localStorage.removeItem(key)
  } catch {
    // Same as `saveWizardProgress`: storage may be unavailable, and an
    // unremovable key is not worth failing the exit over.
  }
}
