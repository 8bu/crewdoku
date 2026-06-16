import { Seg } from '../ui'
import { useI18n } from './I18nProvider'
import type { Locale } from './messages'

/** EN | VI segmented control. Switches the chrome locale only. */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n()
  return (
    <Seg
      ariaLabel={t('Language')}
      value={locale}
      onChange={(v) => setLocale(v as Locale)}
      options={[
        { v: 'en', label: 'EN' },
        { v: 'vi', label: 'VI' },
      ]}
    />
  )
}
