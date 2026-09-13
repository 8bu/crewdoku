/**
 * Shared paste-a-list import dialog used by the Roster and Teams modules.
 * Generalizes the onboarding People step's paste UX (textarea + optional CSV
 * upload + live summary) into a reusable, i18n-agnostic component: callers
 * pass every display string as a prop, so this component never calls the
 * translation hook itself.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'

export function BatchImportModal<T>({
  title,
  subtitle,
  placeholder,
  emptyLabel,
  applyLabel,
  cancelLabel,
  parse,
  renderSummary,
  onApply,
  onCancel,
  csv,
}: {
  title: string
  subtitle: ReactNode
  placeholder: string
  emptyLabel: string
  applyLabel: string
  cancelLabel: string
  parse: (text: string) => T[]
  renderSummary: (rows: T[]) => ReactNode
  onApply: (rows: T[]) => void
  onCancel: () => void
  csv?: { label: string; toText: (fileText: string) => { text: string; errors: string[] } }
}) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const [csvErrors, setCsvErrors] = useState<string[]>([])

  useEffect(() => {
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  const rows = parse(text)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-import-title"
      onMouseDown={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          onCancel()
        }
      }}
    >
      <div
        ref={modalRef}
        className="flex w-full max-w-[540px] flex-col gap-4 rounded-lg border border-base-300 bg-base-100 p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-base-300/80 pb-3">
          <div>
            <h2 id="batch-import-title" className="m-0 text-base font-semibold tracking-tight text-base-content">
              {title}
            </h2>
            <p className="m-0 mt-0.5 text-xs text-base-content/60">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={cancelLabel}
            className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
          >
            ✕
          </button>
        </div>

        <textarea
          className="textarea textarea-bordered h-52 w-full font-mono text-sm leading-relaxed"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />

        {csvErrors.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-error">
            {csvErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-base-content/70">{rows.length === 0 ? emptyLabel : renderSummary(rows)}</div>
          {csv && (
            <label className="btn btn-ghost btn-xs">
              {csv.label}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    void file.text().then((fileText) => {
                      const { text: added, errors } = csv.toText(fileText)
                      setCsvErrors(errors)
                      if (added) setText((prev) => (prev.trim() ? prev.trimEnd() + '\n' + added : added))
                    })
                  }
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-base-300/80 pt-3">
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => {
              onApply(rows)
              onCancel()
            }}
            className="btn btn-primary btn-sm"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
