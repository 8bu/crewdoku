import { Navigate, Route, Routes } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Shell } from './shell/Shell'
import { Board } from './routes/Board'
import { Coverage } from './routes/Coverage'
import { Roster } from './routes/Roster'
import { Teams } from './routes/Teams'
import { Settings } from './routes/Settings'
import { Export } from './routes/Export'
import { activeOrgIdAtom, activeWorkspaceIdAtom } from './state/orgStore'
import { OrgPicker } from './workspace/OrgPicker'
import { WorkspaceCreate } from './workspace/WorkspaceCreate'
import { PreShellScreen } from './workspace/PreShellScreen'

export function App() {
  const activeOrgId = useAtomValue(activeOrgIdAtom)
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom)
  if (activeOrgId === null || activeWorkspaceId === null) {
    return (
      <PreShellScreen>
        {activeOrgId === null ? <OrgPicker /> : <WorkspaceCreate />}
      </PreShellScreen>
    )
  }
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/board" element={<Board />} />
        <Route path="/coverage" element={<Coverage />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/export" element={<Export />} />
        <Route path="*" element={<Navigate to="/board" replace />} />
      </Route>
    </Routes>
  )
}
