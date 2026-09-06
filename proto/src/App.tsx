import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './shell/Shell'
import { Board } from './routes/Board'
import { Coverage } from './routes/Coverage'
import { Roster } from './routes/Roster'
import { Teams } from './routes/Teams'
import { Settings } from './routes/Settings'
import { Export } from './routes/Export'

export function App() {
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
