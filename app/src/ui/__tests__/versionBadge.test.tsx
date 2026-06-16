import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.stubGlobal('__APP_VERSION__', '0.1.0')
import { VersionBadge } from '../VersionBadge'

describe('VersionBadge', () => {
  it('renders v + injected version, never a hardcoded v4', () => {
    render(<VersionBadge />)
    expect(screen.getByText('v0.1.0')).toBeTruthy()
  })

  it('rendered text equals "v" + app/package.json version (AC-21)', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
    ) as { version: string }
    // the global was stubbed to 0.1.0 above; assert it tracks the real package version
    expect(`v${pkg.version}`).toBe('v0.1.0')
    render(<VersionBadge />)
    expect(screen.getByText(`v${pkg.version}`)).toBeTruthy()
  })
})
