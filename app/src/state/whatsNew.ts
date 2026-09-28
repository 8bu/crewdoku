import { atom } from 'jotai'
import { resolveSeenVersion } from '../whatsNew/whatsNew'

/**
 * The "What's new" version state. Seeded at module load — the panel's first
 * consumer imports this on boot — so a device that has never recorded a
 * version (a fresh visitor, or an install from before this panel existed) gets
 * the running one stored silently instead of a dot for releases it never saw.
 * `writeSeenVersion` in `whatsNew/whatsNew.ts` is the only other writer, and it
 * runs when the panel is opened: seeing the notes is what clears the dot.
 */
export const whatsNewSeenAtom = atom(resolveSeenVersion(__APP_VERSION__))

/**
 * Whether the panel is open. It is one panel for the whole app — both version
 * labels (the rail's footer, the More sheet's) raise this, and `Shell` mounts
 * the single dialog that reads it, so a phone and a desktop can never open two.
 */
export const whatsNewOpenAtom = atom(false)
