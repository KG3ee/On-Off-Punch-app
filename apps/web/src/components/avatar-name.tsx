'use client';

type AvatarNameProps = {
  displayName: string;
  profilePhotoUrl?: string | null;
  subtitle?: string | null;
  size?: number;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export function AvatarName({
  displayName,
  profilePhotoUrl,
  subtitle,
  size = 28,
}: AvatarNameProps) {
  const initials = initialsFromName(displayName);
  const fontSize = Math.max(11, Math.round(size * 0.42));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '999px',
          overflow: 'hidden',
          border: '1px solid var(--line)',
          background: 'var(--surface-alt, rgba(99, 102, 241, 0.08))',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {profilePhotoUrl ? (
          <img
            src={profilePhotoUrl}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: `${fontSize}px`, fontWeight: 700, color: 'var(--brand)' }}>
            {initials}
          </span>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </div>
        {subtitle ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
