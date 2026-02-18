'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type ShiftChangeRequest = {
    id: string;
    user: { displayName: string; staffCode: string };
    shiftPreset: { name: string };
    requestedDate: string;
    reason: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

export default function AdminRequestsPage() {
    const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        void load();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const data = await apiFetch<ShiftChangeRequest[]>('/admin/requests');
            setRequests(data);
        } catch (err) {
            setError('Failed to load requests');
        } finally {
            setLoading(false);
        }
    }

    async function handleAction(id: string, action: 'approve' | 'reject') {
        setError('');
        setMessage('');
        try {
            await apiFetch(`/admin/requests/${id}/${action}`, { method: 'POST' });
            setMessage(`Request ${action}d successfully`);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to ${action} request`);
        }
    }

    return (
        <AppShell title="Shift Requests" subtitle="Approve or reject schedule changes" admin userRole="ADMIN">
            {message && <div className="alert alert-success">{message}</div>}
            {error && <div className="alert alert-error">{error}</div>}

            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Date</th>
                            <th>Requested Shift</th>
                            <th>Reason</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map(req => (
                            <tr key={req.id}>
                                <td>
                                    <div>{req.user.displayName}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{req.user.staffCode}</div>
                                </td>
                                <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                                <td>{req.shiftPreset.name}</td>
                                <td>{req.reason || '-'}</td>
                                <td>
                                    <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : ''}`}>
                                        {req.status}
                                    </span>
                                </td>
                                <td>
                                    {req.status === 'PENDING' && (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="button button-sm button-ok"
                                                onClick={() => void handleAction(req.id, 'approve')}
                                                disabled={loading}
                                            >
                                                Approve
                                            </button>
                                            <button
                                                className="button button-sm button-danger"
                                                onClick={() => void handleAction(req.id, 'reject')}
                                                disabled={loading}
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {requests.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>No pending requests</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </AppShell>
    );
}
