import { createStore as createZustandStore, type StoreApi } from 'zustand/vanilla'
import {
  buildContext,
  buildDemo,
  buildModel,
  buildProposal,
  deriveConflictCore,
  fromScheduleDTO,
  mapSolution,
  toScheduleDTO,
  makeSchedule,
  setAssignment as domainSetAssignment,
  removeEmployee as domainRemoveEmployee,
  makeRules,
  type AppStateDTO,
  type Assignment,
  type BuildModelOptions,
  type ConflictResult,
  type Coverage,
  type Employee,
  type ModelMeta,
  type Org,
  type Period,
  type Proposal,
  type Rules,
  type Schedule,
  type Shift,
  type SolveContext,
  type SolverPort,
  type StoragePort,
  type Team,
} from '@crewdoku/domain'

/**
 * View modes — single-user, NOT roles (design §3). The shell switches the main
 * surface between these. P6a ships `board`; the rest are seams the P6b feature
 * dispatch fills in.
 */
export type ViewMode = 'board' | 'config' | 'solve' | 'onboarding' | 'export'

/**
 * The app store is a thin presentation layer over @crewdoku/domain. It holds
 * domain state (entities + the single Schedule Map source of truth + Period) and
 * view state (current surface, selection, pins, proposal). Every mutating action
 * delegates to a DOMAIN function — the store never reimplements scheduling logic.
 */
export interface AppStore {
  // --- domain state ---
  org: Org | null
  teams: Team[]
  shifts: Shift[]
  employees: Employee[]
  coverages: Coverage[]
  rules: Rules
  schedule: Schedule
  period: Period

  // --- view state ---
  view: ViewMode
  selectedEmployeeId: string | null
  /** Cells pinned (locked) before a solve — `${employeeId}|${date}` keys. */
  pins: Set<string>
  /** Solver proposal (P6b). Shape preserved per design §7. */
  proposal: Proposal | null
  /** Infeasible diagnostic (conflict core + relaxations) when the solver fails. */
  conflict: ConflictResult | null
  /** 'idle' | 'solving' | 'done' | 'infeasible' — drives the solver aria-live region. */
  solverPhase: string
  /** Milliseconds the last solve took (UI display). */
  solverElapsed: number
  /** Stash for the shared solver index map between buildModel and mapSolution (P6b). */
  _lastMeta: ModelMeta | null
  /** Stash of the buildModel options used by the last solve (relaxations merge onto this). */
  _lastInputs: BuildModelOptions | null

  // --- ports (injected; default adapters wired by the app, not in tests) ---
  _solver: SolverPort | null
  _storage: StoragePort | null

  // --- actions (all delegate to domain) ---
  loadDemo(): void
  hydrateFromDTO(dto: AppStateDTO): void
  toDTO(): AppStateDTO
  setAssignment(a: Assignment): void
  removeEmployee(employeeId: string): void
  setView(view: ViewMode): void
  selectEmployee(employeeId: string | null): void
  togglePin(key: string): void
  setSolver(port: SolverPort): void
  setStorage(port: StoragePort): void
  /** Persist the current state via the injected StoragePort (no-op if none). */
  persist(): Promise<void>
  /** Hydrate from the injected StoragePort on boot (no-op if none/empty). */
  hydrate(): Promise<void>

  // --- solve flow (Task 6.4) ---
  solve(opts?: BuildModelOptions): Promise<void>
  applyProposal(acceptedKeys: string[]): void
  discardProposal(): void
  /** Re-run the model with a conflict relaxation applied (infeasible flow). */
  applyRelaxation(relaxationId: string): Promise<void>
  /** Build a SolveContext snapshot from current store entities + rules. */
  context(): SolveContext

  // --- entity edit actions (Task 6.5 config) ---
  updateRules(patch: Partial<Rules>): void
  toggleConstraint(id: keyof Rules['enabled']): void
  setWeight(id: keyof Rules['weights'], value: number): void
  upsertShift(shift: Shift): void
  removeShift(shiftId: string): void
  upsertTeam(team: Team): void
  upsertEmployee(employee: Employee): void
  upsertCoverage(coverage: Coverage): void
  setOrg(org: Org): void
  setEntities(input: {
    org?: Org | null
    teams?: Team[]
    shifts?: Shift[]
    employees?: Employee[]
    coverages?: Coverage[]
    rules?: Rules
    period?: Period
  }): void
}

function dtoToState(dto: AppStateDTO): Pick<
  AppStore,
  'org' | 'teams' | 'shifts' | 'employees' | 'coverages' | 'rules' | 'schedule' | 'period'
> {
  return {
    org: dto.org,
    teams: dto.teams,
    shifts: dto.shifts,
    employees: dto.employees,
    coverages: dto.coverages,
    rules: dto.rules,
    schedule: fromScheduleDTO(dto.assignments),
    period: dto.period,
  }
}

export function createStore(opts: {
  storage?: StoragePort | null
  solver?: SolverPort | null
} = {}): StoreApi<AppStore> {
  return createZustandStore<AppStore>((set, get) => ({
    // domain state — empty until loadDemo / hydrate / onboarding
    org: null,
    teams: [],
    shifts: [],
    employees: [],
    coverages: [],
    rules: makeRules(),
    schedule: makeSchedule(),
    period: { startDate: '2026-06-15', weeks: 2 },

    // view state
    view: 'board',
    selectedEmployeeId: null,
    pins: new Set<string>(),
    proposal: null,
    conflict: null,
    solverPhase: 'idle',
    solverElapsed: 0,
    _lastMeta: null,
    _lastInputs: null,

    _solver: opts.solver ?? null,
    _storage: opts.storage ?? null,

    loadDemo() {
      set({ ...dtoToState(buildDemo()), proposal: null, solverPhase: 'idle' })
      void get().persist()
    },

    hydrateFromDTO(dto) {
      set(dtoToState(dto))
    },

    toDTO(): AppStateDTO {
      const st = get()
      return {
        org: st.org,
        teams: st.teams,
        shifts: st.shifts,
        employees: st.employees,
        coverages: st.coverages,
        rules: st.rules,
        assignments: toScheduleDTO(st.schedule),
        period: st.period,
      }
    },

    setAssignment(a) {
      // Mutate the domain Schedule, then publish a NEW Schedule object so React
      // sees a reference change. The Map identity is preserved by makeSchedule.
      const next = fromScheduleDTO(toScheduleDTO(get().schedule))
      domainSetAssignment(next, a)
      set({ schedule: next })
      void get().persist()
    },

    removeEmployee(employeeId) {
      const next = fromScheduleDTO(toScheduleDTO(get().schedule))
      // id-safe domain delete: removes only this employee's assignments by the
      // stored employeeId field (NOT key string-splitting). Other employees'
      // assignments stay correctly attributed (AC-5).
      domainRemoveEmployee(next, employeeId)
      set({
        schedule: next,
        employees: get().employees.filter((e) => e.id !== employeeId),
        selectedEmployeeId:
          get().selectedEmployeeId === employeeId ? null : get().selectedEmployeeId,
      })
      void get().persist()
    },

    setView(view) {
      set({ view })
    },

    selectEmployee(employeeId) {
      set({ selectedEmployeeId: employeeId })
    },

    togglePin(key) {
      const pins = new Set(get().pins)
      if (pins.has(key)) pins.delete(key)
      else pins.add(key)
      set({ pins })
    },

    setSolver(port) {
      set({ _solver: port })
    },

    setStorage(port) {
      set({ _storage: port })
    },

    async persist() {
      const storage = get()._storage
      if (!storage) return
      await storage.save(get().toDTO())
    },

    async hydrate() {
      const storage = get()._storage
      if (!storage) return
      const dto = await storage.load()
      if (dto) set(dtoToState(dto))
    },

    // --- solve flow (Task 6.4) ---
    context() {
      const st = get()
      return buildContext({
        ...(st.org ? { org: st.org } : {}),
        teams: st.teams,
        shifts: st.shifts,
        employees: st.employees,
        coverages: st.coverages,
        rules: st.rules,
      })
    },

    async solve(opts) {
      const solver = get()._solver
      if (!solver) return
      const st = get()
      const ctx = get().context()
      // Honour pins as fixed cells unless the caller's opts already supplied a
      // pins set (relaxation re-runs pass a fully-merged opts object).
      const inputs: BuildModelOptions = opts ?? { pins: st.pins }
      set({ solverPhase: 'solving', conflict: null, proposal: null, solverElapsed: 0 })
      const t0 = Date.now()
      const { lp, meta } = buildModel(ctx, st.period, st.schedule, inputs)
      set({ _lastMeta: meta, _lastInputs: inputs })
      let solution
      try {
        solution = await solver.solve(lp)
      } catch {
        set({ solverPhase: 'idle' })
        return
      }
      const elapsed = Date.now() - t0
      const status = (solution.status ?? '').toLowerCase()
      if (status.includes('infeasible') || status.includes('unbounded')) {
        const conflict = deriveConflictCore(ctx, st.schedule, st.period)
        set({ solverPhase: 'infeasible', conflict, solverElapsed: elapsed })
        return
      }
      const solved = mapSolution(solution, meta)
      const proposal = buildProposal(ctx, st.schedule, solved, st.period)
      set({ proposal, solverPhase: 'done', solverElapsed: elapsed })
    },

    applyProposal(acceptedKeys) {
      const proposal = get().proposal
      if (!proposal) return
      const accepted = new Set(acceptedKeys)
      const next = fromScheduleDTO(toScheduleDTO(get().schedule))
      for (const change of proposal.changes) {
        const key = `${change.employeeId}|${change.date}`
        if (!accepted.has(key)) continue
        // Write the solved value: a fill or a swap. `to:null` means the solver
        // would clear the cell — represent that with an explicit empty assignment.
        domainSetAssignment(next, {
          employeeId: change.employeeId,
          date: change.date,
          shiftId: change.to,
        })
      }
      set({ proposal: null, solverPhase: 'idle', schedule: next })
      void get().persist()
    },

    discardProposal() {
      set({ proposal: null, conflict: null, solverPhase: 'idle' })
    },

    async applyRelaxation(relaxationId) {
      const conflict = get().conflict
      const relax = conflict?.relaxations.find((r) => r.id === relaxationId)
      if (!relax) return
      const base = get()._lastInputs ?? { pins: get().pins }
      const patched = relax.apply(base)
      await get().solve(patched)
    },

    // --- entity edit actions (Task 6.5 config) ---
    updateRules(patch) {
      set({ rules: { ...get().rules, ...patch } })
      void get().persist()
    },

    toggleConstraint(id) {
      const rules = get().rules
      set({
        rules: { ...rules, enabled: { ...rules.enabled, [id]: !rules.enabled[id] } },
      })
      void get().persist()
    },

    setWeight(id, value) {
      const rules = get().rules
      set({ rules: { ...rules, weights: { ...rules.weights, [id]: value } } })
      void get().persist()
    },

    upsertShift(shift) {
      const shifts = get().shifts
      const i = shifts.findIndex((s) => s.id === shift.id)
      const next = i >= 0 ? shifts.map((s) => (s.id === shift.id ? shift : s)) : [...shifts, shift]
      set({ shifts: next })
      void get().persist()
    },

    removeShift(shiftId) {
      set({
        shifts: get().shifts.filter((s) => s.id !== shiftId),
        coverages: get().coverages.filter((c) => c.shiftId !== shiftId),
        teams: get().teams.map((t) => ({
          ...t,
          shiftIds: t.shiftIds.filter((id) => id !== shiftId),
        })),
        employees: get().employees.map((e) => ({
          ...e,
          eligibleShiftIds: e.eligibleShiftIds.filter((id) => id !== shiftId),
        })),
      })
      void get().persist()
    },

    upsertTeam(team) {
      const teams = get().teams
      const i = teams.findIndex((t) => t.id === team.id)
      const next = i >= 0 ? teams.map((t) => (t.id === team.id ? team : t)) : [...teams, team]
      set({ teams: next })
      void get().persist()
    },

    upsertEmployee(employee) {
      const employees = get().employees
      const i = employees.findIndex((e) => e.id === employee.id)
      const next =
        i >= 0 ? employees.map((e) => (e.id === employee.id ? employee : e)) : [...employees, employee]
      set({ employees: next })
      void get().persist()
    },

    upsertCoverage(coverage) {
      const coverages = get().coverages
      const i = coverages.findIndex(
        (c) => c.teamId === coverage.teamId && c.shiftId === coverage.shiftId,
      )
      const next =
        i >= 0
          ? coverages.map((c) =>
              c.teamId === coverage.teamId && c.shiftId === coverage.shiftId ? coverage : c,
            )
          : [...coverages, coverage]
      set({ coverages: next })
      void get().persist()
    },

    setOrg(org) {
      set({ org })
      void get().persist()
    },

    setEntities(input) {
      set({
        ...(input.org !== undefined ? { org: input.org } : {}),
        ...(input.teams !== undefined ? { teams: input.teams } : {}),
        ...(input.shifts !== undefined ? { shifts: input.shifts } : {}),
        ...(input.employees !== undefined ? { employees: input.employees } : {}),
        ...(input.coverages !== undefined ? { coverages: input.coverages } : {}),
        ...(input.rules !== undefined ? { rules: input.rules } : {}),
        ...(input.period !== undefined ? { period: input.period } : {}),
      })
      void get().persist()
    },
  }))
}
