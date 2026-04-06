'use client';

type EmptyStateType =
  | 'no-breaks'
  | 'no-sessions'
  | 'no-notifications'
  | 'no-requests'
  | 'no-data'
  | 'offline'
  | 'error'
  | 'no-results'
  | 'no-one-on-break';

export function EmptyStateIllustration({
  type,
  size = 120,
}: {
  type: EmptyStateType;
  size?: number;
}) {
  const illustrations: Record<EmptyStateType, React.ReactNode> = {
    'no-breaks': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.3)" strokeWidth="2" />
        <circle cx="60" cy="45" r="12" fill="rgba(59,130,246,0.2)" stroke="var(--brand)" strokeWidth="2" />
        <path d="M48 70c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
        <path d="M35 80h50M40 90h40" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
    'no-sessions': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(113,113,122,0.1)" stroke="rgba(113,113,122,0.3)" strokeWidth="2" />
        <rect x="40" y="35" width="40" height="50" rx="4" fill="rgba(113,113,122,0.15)" stroke="var(--muted)" strokeWidth="2" />
        <path d="M50 50h20M50 60h20M50 70h12" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <circle cx="60" cy="95" r="3" fill="var(--muted)" opacity="0.4" />
      </svg>
    ),
    'no-notifications': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.3)" strokeWidth="2" />
        <path d="M60 35c-8.284 0-15 6.716-15 15v12l-5 8h40l-5-8V50c0-8.284-6.716-15-15-15z" fill="rgba(34,197,94,0.15)" stroke="var(--ok)" strokeWidth="2" />
        <path d="M55 68a5 5 0 0010 0" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" />
        <path d="M45 45l30 30M75 45l-30 30" stroke="var(--ok)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      </svg>
    ),
    'no-requests': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(245,158,11,0.1)" stroke="rgba(245,158,11,0.3)" strokeWidth="2" />
        <rect x="35" y="40" width="50" height="40" rx="4" fill="rgba(245,158,11,0.15)" stroke="var(--warning)" strokeWidth="2" />
        <path d="M45 55h30M45 65h20" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <circle cx="60" cy="92" r="3" fill="var(--warning)" opacity="0.4" />
      </svg>
    ),
    'no-data': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(113,113,122,0.1)" stroke="rgba(113,113,122,0.3)" strokeWidth="2" />
        <ellipse cx="60" cy="45" rx="20" ry="8" fill="rgba(113,113,122,0.15)" stroke="var(--muted)" strokeWidth="2" />
        <path d="M40 45v30c0 4.418 8.954 8 20 8s20-3.582 20-8V45" stroke="var(--muted)" strokeWidth="2" />
        <path d="M40 60c0 4.418 8.954 8 20 8s20-3.582 20-8" stroke="var(--muted)" strokeWidth="2" opacity="0.5" />
      </svg>
    ),
    'offline': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.3)" strokeWidth="2" />
        <path d="M45 50c4-4 10-6 15-6s11 2 15 6" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M50 58c3-3 7-4 10-4s7 1 10 4" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        <circle cx="60" cy="68" r="4" fill="var(--danger)" />
        <path d="M40 40l40 40M80 40l-40 40" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </svg>
    ),
    'error': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.3)" strokeWidth="2" />
        <circle cx="60" cy="60" r="20" fill="rgba(239,68,68,0.15)" stroke="var(--danger)" strokeWidth="2" />
        <path d="M60 50v12" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="60" cy="68" r="2" fill="var(--danger)" />
        <path d="M48 48l24 24M72 48l-24 24" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      </svg>
    ),
    'no-results': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(113,113,122,0.1)" stroke="rgba(113,113,122,0.3)" strokeWidth="2" />
        <circle cx="52" cy="52" r="12" stroke="var(--muted)" strokeWidth="2" />
        <path d="M61 61l12 12" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" />
        <path d="M45 45l14 14" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
        <path d="M40 80h40" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      </svg>
    ),
    'no-one-on-break': (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.3)" strokeWidth="2" />
        <circle cx="60" cy="48" r="10" fill="rgba(34,197,94,0.15)" stroke="var(--ok)" strokeWidth="2" />
        <path d="M50 70c0-5.523 4.477-10 10-10s10 4.477 10 10v8H50v-8z" fill="rgba(34,197,94,0.15)" stroke="var(--ok)" strokeWidth="2" />
        <path d="M42 52l-6 6M78 52l6 6M42 64l-6-6M78 64l6-6" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </svg>
    ),
  };

  return <>{illustrations[type]}</>;
}

export function EmptyState({
  type,
  title,
  description,
  action,
}: {
  type: EmptyStateType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-illustration">
        <EmptyStateIllustration type={type} />
      </div>
      <h4 className="empty-state-title">{title}</h4>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
