/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:          'var(--bg)',
        surface:     'var(--surface)',
        'surface-2': 'var(--surface-2)',
        raised:      'var(--raised)',
        bd:          'var(--border)',
        bds:         'var(--border-strong)',
        ink:         'var(--text)',
        dim:         'var(--text-dim)',
        faint:       'var(--text-faint)',
      },
      fontFamily: {
        ui:   ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['var(--fs-2xs)', { lineHeight: '1.4'  }],
        xs:    ['var(--fs-xs)',  { lineHeight: '1.45' }],
        sm:    ['var(--fs-sm)',  { lineHeight: '1.5'  }],
        md:    ['var(--fs-md)',  { lineHeight: '1.5'  }],
        lg:    ['var(--fs-lg)',  { lineHeight: '1.5'  }],
      },
    },
  },
  plugins: [],
}
