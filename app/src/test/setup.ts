import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Without `globals: true`, @testing-library/react does not auto-register its
// afterEach cleanup, so successive render() calls accumulate in the DOM. Wire it
// explicitly so each test starts from a clean document.
afterEach(() => {
  cleanup()
})
