import SF from '../data/sf'
import DB from '../data/db'

export const initialState = {
  role:         'admin',
  adminView:    'board',
  adminSection: 'shifts',
  empView:      'schedule',
  weekOffset:   0,
  seedMode:     false,
  pins:         new Set(SF.PINS),
  overrides:    new Map(),
  diff:         null,
  swaps:        [],
  prefs: [
    { id: 'p1', empIdx: 12, kind: 'avoid',  shift: 'N', scope: 'Mondays'  },
    { id: 'p2', empIdx: 12, kind: 'prefer', shift: 'M', scope: 'Any day'  },
  ],
  empIdx:   12,
  dbLoaded: false,
}

let _swapSeed = 100

export function reducer(state, a) {
  switch (a.type) {
    case 'SET_ROLE':      return { ...state, role: a.role, seedMode: false }
    case 'ADMIN_VIEW':    return { ...state, adminView: a.view }
    case 'ADMIN_SECTION': return { ...state, adminSection: a.section }
    case 'EMP_VIEW':      return { ...state, empView: a.view }
    case 'SET_EMPIDX':    return { ...state, empIdx: a.idx }
    case 'WEEK':          return { ...state, weekOffset: a.set !== undefined ? a.set : state.weekOffset + a.delta }
    case 'SEED_TOGGLE':   return { ...state, seedMode: !state.seedMode }
    case 'SEED_OFF':      return { ...state, seedMode: false }
    case 'PIN_TOGGLE': {
      const pins = new Set(state.pins)
      pins.has(a.key) ? pins.delete(a.key) : pins.add(a.key)
      return { ...state, pins }
    }
    case 'SET_CELL': {
      const overrides = new Map(state.overrides)
      overrides.set(a.key, { code: a.code, viol: a.viol || [] })
      return { ...state, overrides }
    }
    case 'MOVE_CELL': {
      const overrides = new Map(state.overrides)
      overrides.set(a.src.key, { code: a.src.code, viol: a.src.viol || [] })
      overrides.set(a.dst.key, { code: a.dst.code, viol: a.dst.viol || [] })
      return { ...state, overrides }
    }
    case 'SET_PROPOSAL': return { ...state, diff: { proposal: a.proposal, decided: new Map() } }
    case 'DIFF_DECIDE': {
      const decided = new Map(state.diff.decided)
      a.decision ? decided.set(a.key, a.decision) : decided.delete(a.key)
      return { ...state, diff: { ...state.diff, decided } }
    }
    case 'DIFF_ALL': {
      const decided = new Map()
      state.diff.proposal.changes.forEach(c => decided.set(c.key, a.decision))
      return { ...state, diff: { ...state.diff, decided } }
    }
    case 'DIFF_APPLY': {
      const overrides = new Map(state.overrides)
      state.diff.proposal.changes.forEach(c => {
        if (state.diff.decided.get(c.key) === 'accept') overrides.set(c.key, { code: c.to, viol: [] })
      })
      return { ...state, overrides, diff: null }
    }
    case 'DIFF_DISCARD': return { ...state, diff: null }
    case 'SWAP_PROPOSE': {
      const sw = {
        id: 'SW-' + (++_swapSeed),
        fromEmp: a.fromEmp, toEmp: a.toEmp,
        absDay: a.absDay, fromShift: a.fromShift, toShift: a.toShift,
        status: 'pending',
      }
      return { ...state, swaps: [sw, ...state.swaps] }
    }
    case 'SWAP_ACCEPT': {
      const sw = state.swaps.find(s => s.id === a.id)
      if (!sw) return state
      const overrides = new Map(state.overrides)
      overrides.set(sw.fromEmp + '|' + sw.absDay, { code: sw.toShift,   viol: [] })
      overrides.set(sw.toEmp   + '|' + sw.absDay, { code: sw.fromShift, viol: [] })
      return { ...state, overrides, swaps: state.swaps.map(s => s.id === a.id ? { ...s, status: 'accepted' } : s) }
    }
    case 'SWAP_DECLINE': return { ...state, swaps: state.swaps.map(s => s.id === a.id ? { ...s, status: 'declined'  } : s) }
    case 'SWAP_CANCEL':  return { ...state, swaps: state.swaps.map(s => s.id === a.id ? { ...s, status: 'cancelled' } : s) }
    case 'PREF_ADD':    return { ...state, prefs: [...state.prefs, a.pref] }
    case 'PREF_REMOVE': return { ...state, prefs: state.prefs.filter(p => p.id !== a.id) }
    case 'CLEAR_EDITS': return { ...state, overrides: new Map() }
    case 'UNPIN_ALL':   return { ...state, pins: new Set() }
    case 'DB_LOAD':     return {
      ...state,
      overrides: a.data.overrides ? DB.objToMap(a.data.overrides) : state.overrides,
      swaps:     a.data.swaps     || state.swaps,
      prefs:     a.data.prefs     || state.prefs,
      dbLoaded:  true,
    }
    default: return state
  }
}
