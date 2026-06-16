/**
 * VersionBadge renders the single source of truth for the app version:
 * `__APP_VERSION__`, injected by Vite from app/package.json `version`
 * (see vite.config.ts `define`). There is NO hardcoded version literal anywhere
 * — bumping the package version (e.g. via Changesets) updates this badge with no
 * drift (AC-21). The global is declared in src/vite-env.d.ts.
 */
export function VersionBadge() {
  return (
    <span className="font-mono text-2xs px-1 border border-bd rounded-[2px] text-faint">
      {'v' + __APP_VERSION__}
    </span>
  )
}
