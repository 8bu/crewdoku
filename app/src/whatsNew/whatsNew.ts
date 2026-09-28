/**
 * The rules behind the version label and its dot, kept out of the components so
 * they can be read (and tested) on their own.
 *
 * The seen version is a plain string in localStorage — the version this device
 * has already shown. Everything else is derived: which versions the panel may
 * list, and whether the label should carry a dot. The version list itself is
 * open here (`{ version: string }`), so these rules read a real release list and
 * a two-line fixture alike.
 */

export const WHATS_NEW_SEEN_KEY = 'crewdoku-whats-new-seen'

/**
 * Orders two `x.y.z` versions: negative when `a` is older, 0 when they are the
 * same, positive when newer. A missing or unparsable segment counts as 0, so a
 * stray "0.2" still compares sensibly against "0.2.0".
 */
export function compareVersions(a: string, b: string): number {
  // `parseInt` yields NaN for a missing or unparsable segment; `|| 0` folds that
  // into zero, so a stray "0.2" still lands beside "0.2.0".
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference !== 0) return difference > 0 ? 1 : -1
  }
  return 0
}

/**
 * The versions a build at `current` may show: released versions only, so notes
 * authored in a Release PR stay invisible until that version is the running one.
 * Newest first, as the caller's list is written.
 */
export function visibleReleases<T extends { version: string }>(
  releases: readonly T[],
  current: string,
): readonly T[] {
  return releases.filter((release) => compareVersions(release.version, current) <= 0)
}

/**
 * Whether the label should carry the dot: the device has seen an older version
 * than the one running, and one of the versions it could now read is newer than
 * what it saw. A device already at (or, after a rollback, ahead of) the running
 * version has nothing new to show.
 */
export function hasUnseenReleases<T extends { version: string }>(
  seen: string,
  current: string,
  releases: readonly T[],
): boolean {
  if (compareVersions(current, seen) <= 0) return false
  return visibleReleases(releases, current).some((release) => compareVersions(release.version, seen) > 0)
}

/** The version this device has already shown, or null when it has never been recorded. */
export function readSeenVersion(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(WHATS_NEW_SEEN_KEY)
  } catch {
    // Locked-down browsers throw on read; treat it as nothing seen.
    return null
  }
}

/** Records that this device has now seen `version`. */
export function writeSeenVersion(version: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, version)
  } catch {
    // Same on write: a failed write only means the dot shows again next visit.
  }
}

/**
 * What this device has seen, resolving the two cases that must not raise a dot:
 * a fresh visitor, and an install that predates this panel. Both start from the
 * running version, stored silently — nobody is told about releases that shipped
 * before they arrived.
 */
export function resolveSeenVersion(current: string): string {
  const seen = readSeenVersion()
  if (seen !== null) return seen
  writeSeenVersion(current)
  return current
}
