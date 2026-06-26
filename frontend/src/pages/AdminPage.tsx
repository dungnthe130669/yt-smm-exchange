import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { FadeUp } from '../components/ui/Motion'
import { Users, ListBullets, ChartBar, ShieldCheck, CurrencyDollar, UsersThree, PencilSimple, Trash } from '@phosphor-icons/react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  users: number
  tasks: Array<{ cnt: number; status: string }>
  claims: Array<{ cnt: number; status: string }>
  wallets: { total_coin: number; total_coin_pending: number }
}

interface AdminUser {
  id: string; name: string; email: string; role: string
  group_id: string | null; group_name: string; max_channels: number
  linked_channels_count: number
  created_at: number; coin_balance: number; coin_pending: number; balance_usd_micro: number
}

interface AdminTask {
  id: string; channel_name: string | null; channel_id: string
  action_type: string; task_type: string; status: string; target_count: number; delivered_count: number
  buyer_email: string; created_at: number; price_per_unit_usd_micro: number; coin_per_unit: number
}

interface AdminClaim {
  id: string; task_id: string; claimer_email: string
  channel_name: string | null; action_type: string
  status: string; claimed_at: number; coin_amount: number
  youtube_channel_id: string | null
}

interface UserGroup {
  id: string; name: string; max_channels: number; created_at: number; user_count: number
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <p className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{label}</p>
      <p className="text-2xl font-bold display">{value}</p>
    </div>
  )
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

function StatsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<AdminStats>('/admin/stats'),
  })

  if (isLoading) return <div className="card p-8 animate-pulse h-32" />

  const taskTotal = data?.tasks.reduce((a, t) => a + t.cnt, 0) ?? 0
  const claimTotal = data?.claims.reduce((a, c) => a + c.cnt, 0) ?? 0
  const claimVerified = data?.claims.find(c => c.status === 'VERIFIED')?.cnt ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={data?.users ?? 0} />
        <StatCard label="Total Tasks" value={taskTotal} />
        <StatCard label="Total Claims" value={claimTotal} />
        <StatCard label="Verified Claims" value={claimVerified} />
        <StatCard label="Total Coins Circulating" value={(data?.wallets?.total_coin ?? 0).toLocaleString()} />
        <StatCard label="Coins Pending" value={(data?.wallets?.total_coin_pending ?? 0).toLocaleString()} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-sm font-semibold mb-3">Tasks by Status</p>
          <div className="flex flex-col gap-1.5">
            {data?.tasks.map(t => (
              <div key={t.status} className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-muted)' }}>{t.status}</span>
                <span className="font-medium">{t.cnt}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <p className="text-sm font-semibold mb-3">Claims by Status</p>
          <div className="flex flex-col gap-1.5">
            {data?.claims.map(cl => (
              <div key={cl.status} className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-muted)' }}>{cl.status}</span>
                <span className="font-medium">{cl.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: () => api.get<{ users: AdminUser[]; total: number; page: number; limit: number }>(
      `/admin/users?page=${page}&q=${encodeURIComponent(search)}`
    ),
  })

  const { data: groupsData } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => api.get<{ groups: UserGroup[] }>('/admin/groups'),
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.put(`/admin/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const groupMutation = useMutation({
    mutationFn: ({ id, group_id }: { id: string; group_id: string }) =>
      api.put(`/admin/users/${id}/group`, { group_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / (data?.limit ?? 20))
  const groups = groupsData?.groups ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Search by email or name..."
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setSearch(q); setPage(1) } }}
        />
        <button className="btn btn-primary" onClick={() => { setSearch(q); setPage(1) }}>Search</button>
      </div>

      {isLoading ? <div className="card p-8 animate-pulse h-32" /> : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Email', 'Name', 'Role', 'Group', 'YT Channels', 'Coins', 'Joined', 'Action'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td className="px-4 py-2.5 font-medium">{u.email}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-muted)' }}>{u.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`badge ${u.role === 'admin' ? 'badge-orange' : 'badge-gray'}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="badge badge-gray text-xs">{u.group_name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs mono" style={{ color: 'var(--color-muted)' }}>
                    {u.linked_channels_count} / {u.max_channels}
                  </td>
                  <td className="px-4 py-2.5 mono text-xs">{u.coin_balance} coin</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                    {new Date(u.created_at * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 flex items-center gap-2">
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() => roleMutation.mutate({ id: u.id, role: u.role === 'admin' ? 'user' : 'admin' })}
                      disabled={roleMutation.isPending}
                    >
                      {u.role === 'admin' ? 'Demote' : 'Promote'}
                    </button>
                    {groups.length > 0 && (
                      <select
                        className="input text-xs py-0.5 px-1"
                        value={u.group_id ?? 'default'}
                        onChange={e => groupMutation.mutate({ id: u.id, group_id: e.target.value })}
                        disabled={groupMutation.isPending}
                      >
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost text-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
          <span className="text-sm py-1" style={{ color: 'var(--color-muted)' }}>{page} / {totalPages}</span>
          <button className="btn btn-ghost text-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
        </div>
      )}
    </div>
  )
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

function TasksTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tasks', page, statusFilter],
    queryFn: () => api.get<{ tasks: AdminTask[]; total: number; limit: number }>(
      `/admin/tasks?page=${page}&status=${statusFilter}`
    ),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/admin/tasks/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tasks'] }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / (data?.limit ?? 20))
  const STATUS_OPTIONS = ['', 'OPEN', 'FILLING', 'COMPLETED', 'CANCELLED', 'EXPIRED']

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s || 'ALL'}
            className={`btn text-xs ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setStatusFilter(s); setPage(1) }}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <div className="card p-8 animate-pulse h-32" /> : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Channel', 'Action', 'Status', 'Progress', 'Buyer', 'Date', 'Action'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.tasks.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td className="px-4 py-2.5 font-medium max-w-[140px] truncate">{t.channel_name ?? t.channel_id.slice(0, 12)}</td>
                  <td className="px-4 py-2.5"><span className="badge" style={{ background: t.action_type === 'SUBSCRIBE' ? 'orange' : t.action_type === 'LIKE' ? 'var(--color-danger)' : '#818cf8', color: '#fff' }}>{t.action_type}</span></td>
                  <td className="px-4 py-2.5"><span className="badge badge-gray">{t.status}</span></td>
                  <td className="px-4 py-2.5 mono text-xs">{t.delivered_count}/{t.target_count}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-muted)' }}>{t.buyer_email}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                    {new Date(t.created_at * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="input text-xs py-0.5 px-1"
                      value={t.status}
                      onChange={e => statusMutation.mutate({ id: t.id, status: e.target.value })}
                    >
                      {['OPEN', 'FILLING', 'COMPLETED', 'CANCELLED', 'EXPIRED'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost text-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
          <span className="text-sm py-1" style={{ color: 'var(--color-muted)' }}>{page} / {totalPages}</span>
          <button className="btn btn-ghost text-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
        </div>
      )}
    </div>
  )
}

// ─── Claims Tab ───────────────────────────────────────────────────────────────

function ClaimsTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-claims', page, statusFilter],
    queryFn: () => api.get<{ claims: AdminClaim[]; total: number; limit: number }>(
      `/admin/claims?page=${page}&status=${statusFilter}`
    ),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/admin/claims/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-claims'] }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / (data?.limit ?? 20))
  const STATUS_OPTIONS = ['', 'CLAIMED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED']

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s || 'ALL'}
            className={`btn text-xs ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setStatusFilter(s); setPage(1) }}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <div className="card p-8 animate-pulse h-32" /> : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Claimer', 'Channel', 'Action', 'Status', 'Coins', 'Date', 'Action'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.claims.map(cl => (
                <tr key={cl.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td className="px-4 py-2.5 text-xs font-medium">{cl.claimer_email}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-muted)' }}>{cl.channel_name ?? '—'}</td>
                  <td className="px-4 py-2.5"><span className="badge" style={{ background: cl.action_type === 'SUBSCRIBE' ? 'orange' : cl.action_type === 'LIKE' ? 'var(--color-danger)' : '#818cf8', color: '#fff' }}>{cl.action_type}</span></td>
                  <td className="px-4 py-2.5"><span className="badge badge-gray">{cl.status}</span></td>
                  <td className="px-4 py-2.5 mono text-xs">{cl.coin_amount}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                    {new Date(cl.claimed_at * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="input text-xs py-0.5 px-1"
                      value={cl.status}
                      onChange={e => statusMutation.mutate({ id: cl.id, status: e.target.value })}
                    >
                      {['CLAIMED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost text-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
          <span className="text-sm py-1" style={{ color: 'var(--color-muted)' }}>{page} / {totalPages}</span>
          <button className="btn btn-ghost text-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
        </div>
      )}
    </div>
  )
}

// ─── Pricing Tab ──────────────────────────────────────────────────────────────

const PRICING_FIELDS = [
  { key: 'xu_per_subscribe',      label: 'Coin reward — Subscribe (coin/task)' },
  { key: 'xu_per_like',           label: 'Coin reward — Like (coin/task)' },
  { key: 'xu_per_comment',        label: 'Coin reward — Comment (coin/task)' },
  { key: 'cooldown_seconds',      label: 'Claim cooldown (seconds, 0 = instant)' },
  { key: 'task_cooldown_seconds', label: 'Between-task cooldown (seconds)' },
] as const

type PricingKey = typeof PRICING_FIELDS[number]['key']
type PricingValues = Record<PricingKey, number | ''>

function PricingTab() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [values, setValues] = useState<PricingValues>(() =>
    Object.fromEntries(PRICING_FIELDS.map(f => [f.key, ''])) as PricingValues
  )
  const [initialized, setInitialized] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-pricing'],
    queryFn: () => api.get<Record<string, number>>('/admin/pricing'),
  })

  useEffect(() => {
    if (data && !initialized) {
      setValues(
        Object.fromEntries(
          PRICING_FIELDS.map(f => [f.key, data[f.key] ?? ''])
        ) as PricingValues
      )
      setInitialized(true)
    }
  }, [data, initialized])

  const saveMutation = useMutation({
    mutationFn: () => api.put('/admin/pricing',
      Object.fromEntries(
        PRICING_FIELDS.map(f => [f.key, Number(values[f.key] || 0)])
      )
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pricing'] })
      qc.invalidateQueries({ queryKey: ['task-pricing'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const setField = (key: PricingKey, raw: string) => {
    setValues(prev => ({ ...prev, [key]: parseInt(raw) || '' }))
  }

  if (isLoading) return <div className="card p-8 animate-pulse h-32" />

  return (
    <div className="card p-6 flex flex-col gap-5 max-w-md">
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        These coin rewards apply to all new tasks. Existing tasks are unaffected. Coins are earned by completing tasks — not purchased.
      </p>

      {PRICING_FIELDS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{label}</label>
          <input
            type="number"
            className="input"
            min={0}
            value={values[key]}
            onChange={e => setField(key, e.target.value)}
          />
        </div>
      ))}

      <button
        className="btn btn-primary self-start"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saved ? '✓ Saved' : saveMutation.isPending ? 'Saving...' : 'Save pricing'}
      </button>
    </div>
  )
}

// ─── Groups Tab ───────────────────────────────────────────────────────────────

function GroupsTab() {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editMax, setEditMax] = useState<number | ''>('')
  const [newName, setNewName] = useState('')
  const [newMax, setNewMax] = useState<number | ''>('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => api.get<{ groups: UserGroup[] }>('/admin/groups'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/groups', { name: newName, max_channels: Number(newMax) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] })
      setNewName('')
      setNewMax('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.put(`/admin/groups/${id}`, { name: editName || undefined, max_channels: editMax !== '' ? Number(editMax) : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] })
      setEditId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-groups'] }),
  })

  const startEdit = (g: UserGroup) => {
    setEditId(g.id)
    setEditName(g.name)
    setEditMax(g.max_channels)
  }

  if (isLoading) return <div className="card p-8 animate-pulse h-32" />

  return (
    <div className="flex flex-col gap-6">
      {/* Create form */}
      <div className="card p-5 flex flex-col gap-4 max-w-md">
        <p className="text-sm font-semibold">Create New Group</p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Group Name</label>
            <input
              className="input"
              placeholder="e.g. VIP Users"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Max Channels</label>
            <input
              type="number"
              className="input"
              min={1}
              placeholder="e.g. 5"
              value={newMax}
              onChange={e => setNewMax(parseInt(e.target.value) || '')}
            />
          </div>
          <button
            className="btn btn-primary self-start"
            onClick={() => createMutation.mutate()}
            disabled={!newName || !newMax || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>

      {/* Groups list */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Name', 'Max Channels', 'Users', 'Actions'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.groups.map(g => (
              <tr key={g.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td className="px-4 py-2.5">
                  {editId === g.id ? (
                    <input
                      className="input text-sm py-0.5 px-2 w-40"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                    />
                  ) : (
                    <span className="font-medium">{g.name}</span>
                  )}
                  {g.id === 'default' && (
                    <span className="badge badge-gray ml-2 text-xs">default</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {editId === g.id ? (
                    <input
                      type="number"
                      className="input text-sm py-0.5 px-2 w-20"
                      min={1}
                      value={editMax}
                      onChange={e => setEditMax(parseInt(e.target.value) || '')}
                    />
                  ) : (
                    <span className="mono">{g.max_channels}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 mono text-xs" style={{ color: 'var(--color-muted)' }}>
                  {g.user_count}
                </td>
                <td className="px-4 py-2.5 flex items-center gap-2">
                  {editId === g.id ? (
                    <>
                      <button
                        className="btn btn-primary text-xs"
                        onClick={() => updateMutation.mutate({ id: g.id })}
                        disabled={updateMutation.isPending}
                      >
                        Save
                      </button>
                      <button className="btn btn-ghost text-xs" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-ghost text-xs flex items-center gap-1"
                        onClick={() => startEdit(g)}
                      >
                        <PencilSimple size={13} /> Edit
                      </button>
                      <button
                        className="btn btn-ghost text-xs flex items-center gap-1"
                        style={{ color: g.id === 'default' ? 'var(--color-muted)' : 'var(--color-danger)' }}
                        disabled={g.id === 'default' || deleteMutation.isPending}
                        onClick={() => {
                          if (g.id !== 'default' && confirm(`Delete group "${g.name}"? Users will be moved to default group.`)) {
                            deleteMutation.mutate(g.id)
                          }
                        }}
                      >
                        <Trash size={13} /> Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main AdminPage ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'stats', label: 'Overview', icon: ChartBar },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'tasks', label: 'Tasks', icon: ListBullets },
  { id: 'claims', label: 'Claims', icon: ShieldCheck },
  { id: 'pricing', label: 'Pricing', icon: CurrencyDollar },
  { id: 'groups', label: 'Groups', icon: UsersThree },
]

export function AdminPage() {
  const [tab, setTab] = useState('stats')

  const { data: meData, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: { role: string } | null }>('/me'),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--color-orange)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!meData?.user || meData.user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <FadeUp className="flex items-center gap-2">
        <ShieldCheck size={20} color="var(--color-orange)" weight="fill" />
        <h1 className="display text-xl">Admin Panel</h1>
      </FadeUp>

      <FadeUp delay={0.04}>
        <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--color-border)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
              style={{
                color: tab === id ? 'var(--color-text)' : 'var(--color-muted)',
                borderBottom: tab === id ? '2px solid var(--color-orange)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
              onClick={() => setTab(id)}
            >
              <Icon size={15} weight={tab === id ? 'fill' : 'regular'} />
              {label}
            </button>
          ))}
        </div>
      </FadeUp>

      <FadeUp delay={0.08}>
        {tab === 'stats' && <StatsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'claims' && <ClaimsTab />}
        {tab === 'pricing' && <PricingTab />}
        {tab === 'groups' && <GroupsTab />}
      </FadeUp>
    </div>
  )
}
