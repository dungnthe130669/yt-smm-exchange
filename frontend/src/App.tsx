import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { EarnPage } from './pages/EarnPage'
import { MyTasksPage } from './pages/MyTasksPage'
import { WalletPage } from './pages/WalletPage'
import { LoginPage } from './pages/LoginPage'
import { VerifyResultPage } from './pages/VerifyResultPage'
import { CreateTaskPage } from './pages/CreateTaskPage'
import { ProfilePage } from './pages/ProfilePage'
import { AuthGuard } from './components/layout/AuthGuard'
import { AdminPage } from './pages/AdminPage'

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-result" element={<VerifyResultPage />} />

          {/* App shell — auth guarded */}
          <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
            <Route index element={<EarnPage />} />
            <Route path="/my-tasks" element={<MyTasksPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/create" element={<CreateTaskPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/:tab" element={<AdminPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
