import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { FeedPage } from './pages/FeedPage'
import { MyTasksPage } from './pages/MyTasksPage'
import { WalletPage } from './pages/WalletPage'
import { LoginPage } from './pages/LoginPage'
import { VerifyResultPage } from './pages/VerifyResultPage'
import { CreateTaskPage } from './pages/CreateTaskPage'

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

          {/* App shell */}
          <Route element={<AppLayout />}>
            <Route index element={<FeedPage />} />
            <Route path="/my-tasks" element={<MyTasksPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/create" element={<CreateTaskPage />} />
            <Route path="/profile" element={<div className="card p-8 text-center" style={{ color: 'var(--color-muted)' }}>Profile — Phase 5</div>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
