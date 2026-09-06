import { describe, expect, it } from 'vitest'
import { applyPatch, commitEdit, emptyHistory, redo, undo, type Overrides } from './editHistory'
import type { Assignment } from './mockBoard'

function night(pinned = true): Assignment {
  return { code: 'NIGHT', start: '2200', end: '0600', pinned, ineligible: false }
}

describe('applyPatch', () => {
  it('sets keys with a value and deletes keys mapped to undefined', () => {
    const overrides: Overrides = new Map([['a', night()]])
    const next = applyPatch(overrides, new Map([['a', undefined], ['b', night()]]))
    expect(next.has('a')).toBe(false)
    expect(next.get('b')).toEqual(night())
    // original untouched
    expect(overrides.has('a')).toBe(true)
  })
})

describe('commitEdit / undo / redo', () => {
  it('applies a patch and records its inverse', () => {
    let overrides: Overrides = new Map()
    let history = emptyHistory

    const r1 = commitEdit(history, overrides, new Map([['p1|2026-08-21', night()]]))
    history = r1.history
    overrides = r1.overrides
    expect(overrides.get('p1|2026-08-21')).toEqual(night())
    expect(history.past).toHaveLength(1)
  })

  it('undo reverts to the prior value (including "no override")', () => {
    let overrides: Overrides = new Map()
    let history = emptyHistory

    const first = commitEdit(history, overrides, new Map([['k', night()]]))
    history = first.history
    overrides = first.overrides

    const second = commitEdit(history, overrides, new Map([['k', night(false)]]))
    history = second.history
    overrides = second.overrides
    expect(overrides.get('k')?.pinned).toBe(false)

    const afterUndo = undo(history, overrides)
    expect(afterUndo.overrides.get('k')).toEqual(night(true))

    const afterSecondUndo = undo(afterUndo.history, afterUndo.overrides)
    expect(afterSecondUndo.overrides.has('k')).toBe(false)

    // nothing left to undo — no-op
    const afterThirdUndo = undo(afterSecondUndo.history, afterSecondUndo.overrides)
    expect(afterThirdUndo.overrides.has('k')).toBe(false)
    expect(afterThirdUndo.history.past).toHaveLength(0)
  })

  it('redo replays an undone edit', () => {
    let overrides: Overrides = new Map()
    let history = emptyHistory

    const committed = commitEdit(history, overrides, new Map([['k', night()]]))
    history = committed.history
    overrides = committed.overrides

    const undone = undo(history, overrides)
    expect(undone.overrides.has('k')).toBe(false)

    const redone = redo(undone.history, undone.overrides)
    expect(redone.overrides.get('k')).toEqual(night())
    expect(redone.history.future).toHaveLength(0)
  })

  it('a fresh edit after undo clears the redo stack', () => {
    let overrides: Overrides = new Map()
    let history = emptyHistory

    const a = commitEdit(history, overrides, new Map([['k', night()]]))
    const b = undo(a.history, a.overrides)
    const c = commitEdit(b.history, b.overrides, new Map([['k', night(false)]]))
    expect(c.history.future).toHaveLength(0)
  })
})
