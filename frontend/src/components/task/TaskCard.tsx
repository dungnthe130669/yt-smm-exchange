import { YoutubeLogo, CurrencyCircleDollar, CheckCircle, Clock, XCircle } from '@phosphor-icons/react'
import type { Task } from '../../types'
import { StaggerItem } from '../ui/Motion'

function timeLeft(deadline: number) {
  const diff = deadline * 1000 - Date.now()
  if (diff <= 0) return 'Hết hạn'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  if (d > 0) return `${d}n ${h}h`
  return `${h}h`
}

interface TaskCardProps {
  task: Task
  onClaim?: (taskId: string) => void
  claimed?: boolean
}

export function TaskCard({ task, onClaim, claimed }: TaskCardProps) {
  const progress = task.target_count > 0
    ? Math.round((task.delivered_count / task.target_count) * 100)
    : 0

  const isPay = task.task_type === 'PAY'

  return (
    <StaggerItem>
      <div className="card p-4 flex flex-col gap-3 hover:border-[var(--color-border-hover)] transition-colors">

        {/* Header: channel info + type badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Channel avatar */}
            <div className="relative flex-shrink-0">
              <div
                className="w-10 h-10 rounded-full bg-[var(--color-elevated)] flex items-center justify-center overflow-hidden"
                style={{ boxShadow: '0 0 0 2px var(--color-sub)' }}
              >
                {task.channel_avatar
                  ? <img src={task.channel_avatar} alt="" className="w-full h-full object-cover" />
                  : <YoutubeLogo size={20} color="var(--color-sub)" weight="fill" />
                }
              </div>
              {/* Pulse ring — subscribe action signal */}
              <span
                className="absolute -inset-0.5 rounded-full animate-ping opacity-30"
                style={{ background: 'var(--color-sub)' }}
              />
            </div>

            {/* Channel name + URL */}
            <div className="min-w-0">
              <p className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>
                {task.channel_name ?? task.channel_url}
              </p>
              <a
                href={task.channel_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs truncate block"
                style={{ color: 'var(--color-muted)' }}
              >
                {task.channel_url.replace('https://www.youtube.com/', 'youtube.com/')}
              </a>
            </div>
          </div>

          {/* Type badge */}
          <span className={`badge flex-shrink-0 ${isPay ? 'badge-orange' : 'badge-xu'}`}>
            {isPay
              ? <><CurrencyCircleDollar size={11} weight="fill" /> VND</>
              : <><span className="mono">✦</span> Xu</>
            }
          </span>
        </div>

        {/* Reward */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Phần thưởng</p>
            {isPay
              ? <p className="mono font-medium" style={{ color: 'var(--color-xu)' }}>
                  {task.xu_per_unit} <span className="text-xs" style={{ color: 'var(--color-muted)' }}>xu/sub</span>
                </p>
              : <p className="mono font-medium" style={{ color: 'var(--color-xu)' }}>
                  {task.xu_per_unit} <span className="text-xs" style={{ color: 'var(--color-muted)' }}>xu/sub</span>
                </p>
            }
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Còn lại</p>
            <p className="mono font-medium text-sm">
              {task.target_count - task.delivered_count}
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>/{task.target_count}</span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: progress >= 100 ? 'var(--color-success)' : 'var(--color-orange)',
            }}
          />
        </div>

        {/* Footer: deadline + action */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-muted)' }}>
            <Clock size={12} />
            {timeLeft(task.deadline)}
          </span>

          {claimed
            ? <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success)' }}>
                <CheckCircle size={13} weight="fill" /> Đã nhận
              </span>
            : task.status === 'OPEN'
              ? <button
                  className="btn-primary text-xs py-1.5 px-3"
                  onClick={() => onClaim?.(task.id)}
                >
                  Nhận task
                </button>
              : <span className="badge badge-muted">
                  <XCircle size={11} /> Đã đủ
                </span>
          }
        </div>
      </div>
    </StaggerItem>
  )
}
