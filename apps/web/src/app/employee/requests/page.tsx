'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type ShiftPreset = {
    id: string;
    name: string;
};

type ShiftChangeRequest = {
    id: string;
    shiftPreset: { name: string };
    requestedDate: string;
    reason: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

export default function EmployeeRequestsPage() {
    const [presets, setPresets] = useState<ShiftPreset[]>([]);
    const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [presetId, setPresetId] = useState('');
    const [requestedDate, setRequestedDate] = useState('');
    const [reason, setReason] = useState('');

    useEffect(() => {
        void load();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const [presetsData, requestsData] = await Promise.all([
                apiFetch<ShiftPreset[]>('/shifts/presets'),
                apiFetch<ShiftChangeRequest[]>('/shifts/requests/me'),
            ]);
            setPresets(presetsData);
            setRequests(requestsData);
        } catch (err) {
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!presetId || !requestedDate) return;
        setSubmitting(true);
        setError('');
        setSuccess('');

        try {
            await apiFetch('/shifts/requests', {
                method: 'POST',
                body: JSON.stringify({
                    shiftPresetId: presetId,
                    requestedDate,
                    reason,
                }),
            });
            setSuccess('Request submitted successfully');
            setPresetId('');
            setRequestedDate('');
            setReason('');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AppShell title="Schedule Requests" subtitle="Request shift changes or time off">
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <section className="split">
                <article className="card">
                    <h3>New Request</h3>
                    <form className="form-grid" onSubmit={(e) => void handleSubmit(e)}>
                        <div>
                            <label>Date</label>
                            <input
                                type="date"
                                className="input"
                                required
                                value={requestedDate}
                                onChange={(e) => setRequestedDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label>Shift Type</label>
                            <select
                                className="select"
                                required
                                value={presetId}
                                onChange={(e) => setPresetId(e.target.value)}
                            >
                                <option value="">Select a shift...</option>
                                {presets.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label>Reason (Optional)</label>
                            <input
                                className="input"
                                placeholder="e.g. Doctor appointment, Half day leave"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="button button-primary" disabled={submitting}>
                            {submitting ? 'Submitting...' : 'Submit Request'}
                        </button>
                    </form>
                </article>

                <article className="card">
                    <h3>My Requests</h3>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Shift</th>
                                    <th>Status</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map((req) => (
                                    <tr key={req.id}>
                                        <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                                        <td>{req.shiftPreset.name}</td>
                                        <td>
                                            <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : ''}`}>
                                                {req.status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{req.reason || '-'}</td>
                                    </tr>
                                ))}
                                {requests.length === 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>No requests found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </article>
            </section>
        </AppShell>
    );
}
