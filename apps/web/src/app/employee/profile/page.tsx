'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { MeUser } from '@/types/auth';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  MEMBER: 'Member',
  DRIVER: 'Driver',
  LEADER: 'Team Leader',
  MAID: 'Maid',
  CHEF: 'Chef',
};

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    apiFetch<MeUser>('/me')
      .then((data) => {
        setMe(data);
        setDisplayName(data.displayName);
        setFirstName(data.firstName);
        setLastName(data.lastName || '');
        setUsername(data.username);
        setContactNumber(data.contactNumber || '');
        setVehicleInfo(data.vehicleInfo || '');
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !firstName.trim() || !username.trim()) {
      setError('Display name, first name, and username are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await apiFetch<MeUser>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim() || null,
          username: username.trim(),
          contactNumber: contactNumber.trim() || null,
          vehicleInfo: me?.role === 'DRIVER' ? (vehicleInfo.trim() || null) : undefined,
        }),
      });
      setMe(updated);
      flash('Profile updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setChangingPassword(true);
    setError('');
    try {
      await apiFetch('/me/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      flash('Password changed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 500_000) {
      setError('Image must be smaller than 500KB');
      return;
    }

    setUploadingPhoto(true);
    setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const updated = await apiFetch<MeUser>('/me/profile-photo', {
        method: 'POST',
        body: JSON.stringify({ photoUrl: dataUrl }),
      });
      setMe(updated);
      flash('Profile photo updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemovePhoto() {
    setUploadingPhoto(true);
    setError('');
    try {
      const updated = await apiFetch<MeUser>('/me/profile-photo', {
        method: 'POST',
        body: JSON.stringify({ photoUrl: null }),
      });
      setMe(updated);
      flash('Profile photo removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove photo');
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Profile" subtitle="Loading..." userRole={me?.role}>
        <p style={{ color: 'var(--muted)' }}>Loading profile...</p>
      </AppShell>
    );
  }

  function goBack() {
    if (me?.role === 'ADMIN') {
      router.push('/admin/live');
    } else if (me?.role === 'DRIVER') {
      router.push('/employee/driver');
    } else {
      router.push('/employee/dashboard');
    }
  }

  return (
    <AppShell title="Profile" subtitle="Manage your account" userRole={me?.role}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <button
          type="button"
          onClick={goBack}
          className="button button-ghost button-sm"
          style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Dashboard
        </button>

        {message ? <div className="alert alert-success">{message}</div> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        <div style={{ display: 'grid', gap: '1.25rem' }}>

        {/* ── Profile Photo ── */}
        <article className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Profile Photo</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'var(--surface)', border: '2px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {me?.profilePhotoUrl ? (
                <img src={me.profilePhotoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '2rem', color: 'var(--muted)' }}>
                  {me?.displayName?.[0]?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => void handlePhotoSelect(e)}
              />
              <button
                type="button"
                className="button button-primary button-sm"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
              </button>
              {me?.profilePhotoUrl ? (
                <button
                  type="button"
                  className="button button-ghost button-sm"
                  disabled={uploadingPhoto}
                  onClick={() => void handleRemovePhoto()}
                >
                  Remove
                </button>
              ) : null}
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Max 500KB, JPG/PNG</span>
            </div>
          </div>
        </article>

        {/* ── Personal Info (Editable) ── */}
        <article className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Personal Information</h3>
          <form className="form-grid" onSubmit={(e) => void handleSaveProfile(e)}>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Display Name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>First Name</label>
                <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Last Name</label>
                <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />

            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Contact Number</label>
            <input className="input" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="e.g. 050-123-4567" />

            {me?.role === 'DRIVER' ? (
              <>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Vehicle Info</label>
                <input className="input" value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} placeholder="e.g. Toyota HiAce - White - ABC 1234" />
              </>
            ) : null}

            <div style={{ marginTop: '0.5rem' }}>
              <button type="submit" className="button button-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </article>

        {/* ── Account Info (Read-only) ── */}
        <article className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Account Information</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {[
              { label: 'Staff Code', value: me?.username?.toUpperCase() || '-' },
              { label: 'Role', value: ROLE_LABELS[me?.role || ''] || me?.role || '-', tag: true, tagClass: `role-${me?.role?.toLowerCase()}` },
              { label: 'Team / Group', value: me?.team?.name || 'Service', tag: true, tagClass: me?.team ? 'brand' : '' },
              { label: 'Account Status', value: 'Active', tag: true, tagClass: 'ok' },
              { label: 'Member Since', value: me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : '-' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500 }}>{item.label}</span>
                {item.tag ? (
                  <span className={`tag ${item.tagClass || ''}`}>{item.value}</span>
                ) : (
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.value}</span>
                )}
              </div>
            ))}
          </div>
        </article>

        {/* ── Change Password ── */}
        <article className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Change Password</h3>
          <form className="form-grid" onSubmit={(e) => void handleChangePassword(e)}>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Current Password</label>
            <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />

            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>New Password</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />

            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Confirm New Password</label>
            <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />

            <div style={{ marginTop: '0.5rem' }}>
              <button type="submit" className="button button-primary" disabled={changingPassword}>
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </article>
        </div>
      </div>
    </AppShell>
  );
}
