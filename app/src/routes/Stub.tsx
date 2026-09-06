import { useT } from '../i18n/useT'

type StubProps = {
  title: string
  /** Wayfinder tickets that fill this surface, e.g. "04, 05, 06". */
  tickets: string
}

/** Placeholder for a surface no ticket has built yet. Delete on the way past. */
export function Stub({ title, tickets }: StubProps) {
  const t = useT()
  return (
    <section className="p-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-base-content/60">
        {t('chrome.stub.message', { tickets })}
      </p>
    </section>
  )
}
