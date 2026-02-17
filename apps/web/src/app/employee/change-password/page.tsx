'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { MeUser } from '@/types/auth';

export default function ChangePasswordPage() {
    const [me, setMe] = useState<MeUser | null>(null);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        void apiFetch<MeUser>('/me').then(setMe).catch(() => { });
    }, []);

    async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
        e.preventDefault();
        setError('');
        setMessage('');

        if (newPassword !== confirmPassword) {
            setError('New password and confirmation do not match');
            return;
        }

        if (newPassword.length < 6) {
            setError('New password must be at least 6 characters');
            return;
        }

        if (currentPassword === newPassword) {
            setError('New password must be different from current password');
            return;
        }

        setLoading(true);
        try {
            await apiFetch('/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword })
            });
            setMessage('✓ Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to change password');
        } finally {
            setLoading(false);
        }
    }

    return (
        <AppShell
            title="Change Password"
            subtitle={me ? me.displayName : '…'}
            userRole={me?.role}
        >
            <div className="password-card">
                <form className="card form-grid" onSubmit={(e) => void handleSubmit(e)}>
                    <h3>🔑 Update Your Password</h3>

                    {message ? <div className="alert alert-success">{message}</div> : null}
                    {error ? <div className="alert alert-error">⚠ {error}</div> : null}

                    <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Current Password</label>
                    <input
                        id="current-password"
                        className="input"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        required
                        autoComplete="current-password"
                    />

                    <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>New Password</label>
                    <input
                        id="new-password"
                        className="input"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 6 characters)"
                        minLength={6}
                        required
                        autoComplete="new-password"
                    />

                    <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Confirm New Password</label>
                    <input
                        id="confirm-password"
                        className="input"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        minLength={6}
                        required
                        autoComplete="new-password"
                    />

                    <button
                        type="submit"
                        className="button button-primary"
                        disabled={loading}
                        style={{ marginTop: '0.5rem' }}
                    >
                        {loading ? 'Changing…' : '🔒 Change Password'}
                    </button>
                </form>
            </div>
        </AppShell>
    );
}
