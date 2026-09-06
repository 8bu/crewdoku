/**
 * Hand-drawn inline icon (ticket "load column semantics" follow-up): the
 * fairness column first shipped as a raw Unicode `⚠`, which carries an
 * emoji presentation form that different OS/browser font stacks render
 * wildly inconsistently — thin, foreign-looking outlines that read as a
 * broken-image placeholder, not a deliberate mark (8bu's call: "not fucking
 * alt text"). A plain inline SVG renders identically everywhere, at
 * whatever size and colour the caller sets via `className`/`currentColor`.
 */

export function WarningTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3.5 2.5 20.5h19L12 3.5Z" />
      <path d="M12 9.75v4.5" />
      <circle cx="12" cy="17.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}
