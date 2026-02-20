'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type Team = { id: string; name: string };
type UserRef = { id: string; username: string; displayName: string; role: string };

type AttendanceRecord = {
    id: string;
    localDate: string;
    shiftDate: string;
    punchedOnAt: string;
    punchedOffAt?: string | null;
    status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
    isLate: boolean;
    lateMinutes: number;
    overtimeMinutes: number;
    user: { id: string; username: string; displayName: string; role: string };
    team?: { id: string; name: string } | null;
};

type BreakRecord = {
    id: string;
    localDate: string;
    startedAt: string;
    endedAt?: string | null;
    expectedDurationMinutes: number;
    actualMinutes?: number | null;
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'AUTO_CLOSED';
    isOvertime: boolean;
    breakPolicy: { code: string; name: string };
    user: { displayName: string; team?: { name: string } | null };
};

function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AdminHistoryPage() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [users, setUsers] = useState<UserRef[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [breaks, setBreaks] = useState<BreakRecord[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Filters
    const [fromDate, setFromDate] = useState(todayStr());
    const [toDate, setToDate] = useState(todayStr());
    const [teamId, setTeamId] = useState('');
    const [userId, setUserId] = useState('');
    const [tab, setTab] = useState<'duty' | 'breaks'>('duty');

    useEffect(() => {
        void loadFilters();
        void search();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function loadFilters(): Promise<void> {
        try {
            const [teamData, userData] = await Promise.all([
                apiFetch<Team[]>('/teams'),
                apiFetch<UserRef[]>('/admin/users')
            ]);
            setTeams(teamData);
            setUsers(userData);
        } catch {
            // Non‑critical — filters will just be empty
        }
    }

    async function search(e?: FormEvent<HTMLFormElement>): Promise<void> {
        e?.preventDefault();
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ from: fromDate, to: toDate });
            if (teamId) params.set('teamId', teamId);
            if (userId) params.set('userId', userId);

            const [dutyData, breakData] = await Promise.all([
                apiFetch<AttendanceRecord[]>(`/attendance/admin/attendance?${params.toString()}&limit=500`),
                apiFetch<BreakRecord[]>(`/breaks/admin/history?${params.toString()}&limit=500`)
            ]);
            setAttendance(dutyData);
            setBreaks(breakData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load history');
        } finally {
            setLoading(false);
        }
    }

    // ── Stats ──
    const stats = useMemo(() => {
        const totalSessions = attendance.length;
        const totalLateMin = attendance.reduce((sum, r) => sum + r.lateMinutes, 0);
        const totalOvertimeMin = attendance.reduce((sum, r) => sum + r.overtimeMinutes, 0);

        // Calculate total worked minutes from closed sessions
        const totalWorkedMin = attendance.reduce((sum, r) => {
            if (r.punchedOffAt) {
                const start = new Date(r.punchedOnAt).getTime();
                const end = new Date(r.punchedOffAt).getTime();
                return sum + ((end - start) / 1000 / 60);
            }
            return sum;
        }, 0);

        const totalBreaks = breaks.length;
        const completedBreaks = breaks.filter(b => b.status === 'COMPLETED' || b.status === 'AUTO_CLOSED');
        const totalBreakMin = completedBreaks.reduce((sum, b) => sum + (b.actualMinutes || 0), 0);

        // Round to nearest minute for display
        return {
            totalSessions,
            totalLateMin,
            totalOvertimeMin,
            totalWorkedMin: Math.round(totalWorkedMin),
            totalBreaks,
            totalBreakMin
        };
    }, [attendance, breaks]);

    // ── CSV Export ──
    function exportDutyCSV(): void {
        const header = ['Date', 'Employee', 'Group', 'Punch On', 'Punch Off', 'Status', 'Late', 'Late Minutes', 'Overtime Minutes'];
        const rows = attendance.map(r => [
            r.localDate,
            r.user.displayName,
            r.team?.name || 'Service',
            fmtTime(r.punchedOnAt),
            r.punchedOffAt ? fmtTime(r.punchedOffAt) : '',
            r.status,
            r.isLate ? 'Yes' : 'No',
            String(r.lateMinutes),
            String(r.overtimeMinutes)
        ]);
        downloadCSV([header, ...rows], `duty-history-${fromDate}-${toDate}.csv`);
    }

    function exportBreaksCSV(): void {
        const header = ['Date', 'Employee', 'Group', 'Code', 'Name', 'Start', 'End', 'Expected Min', 'Actual Min', 'Status', 'Overtime'];
        const rows = breaks.map(b => [
            b.localDate,
            b.user.displayName,
            b.user.team?.name || '',
            b.breakPolicy.code.toUpperCase(),
            b.breakPolicy.name,
            fmtTime(b.startedAt),
            b.endedAt ? fmtTime(b.endedAt) : '',
            String(b.expectedDurationMinutes),
            b.actualMinutes !== null && b.actualMinutes !== undefined ? String(b.actualMinutes) : '',
            b.status,
            b.isOvertime ? 'Yes' : 'No'
        ]);
        downloadCSV([header, ...rows], `break-history-${fromDate}-${toDate}.csv`);
    }

    function downloadCSV(data: string[][], filename: string): void {
        const csv = data.map(row =>
            row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <AppShell title="History" subtitle="Attendance &amp; break records" admin userRole="ADMIN">
            {error ? <div className="alert alert-error">⚠ {error}</div> : null}

            {/* ── Filters ── */}
            <form className="card" onSubmit={(e) => void search(e)}>
                <div className="toolbar">
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: '150px' }} />
                        <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>to</span>
                        <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: '150px' }} />
                    </div>
                    <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ width: '150px' }}>
                        <option value="">All Teams</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: '180px' }}>
                        <option value="">All Employees</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                    </select>
                    <button type="submit" className="button button-primary" disabled={loading}>
                        {loading ? 'Loading…' : '🔍 Search'}
                    </button>
                </div>
            </form>

            {/* ── Stats ── */}
            <section className="kpi-grid">
                <article className="kpi">
                    <p className="kpi-label">Duty Sessions</p>
                    <p className="kpi-value">{stats.totalSessions}</p>
                </article>
                <article className="kpi">
                    <p className="kpi-label">Total Worked</p>
                    <p className="kpi-value">{fmtDuration(stats.totalWorkedMin)}</p>
                </article>
                <article className="kpi">
                    <p className="kpi-label">Late Minutes</p>
                    <p className="kpi-value">{stats.totalLateMin > 0 ? <span style={{ color: 'var(--danger)' }}>{fmtDuration(stats.totalLateMin)}</span> : '0'}</p>
                </article>
                <article className="kpi">
                    <p className="kpi-label">Overtime</p>
                    <p className="kpi-value">{stats.totalOvertimeMin > 0 ? <span style={{ color: 'var(--brand)' }}>{fmtDuration(stats.totalOvertimeMin)}</span> : '0'}</p>
                </article>
                <article className="kpi">
                    <p className="kpi-label">Break Sessions</p>
                    <p className="kpi-value">{stats.totalBreaks}</p>
                </article>
                <article className="kpi">
                    <p className="kpi-label">Break Time</p>
                    <p className="kpi-value">{fmtDuration(stats.totalBreakMin)}</p>
                </article>
            </section>

            {/* ── Tab Toggle ── */}
            <div className="toolbar">
                <nav className="nav">
                    <a className={tab === 'duty' ? 'active' : ''} onClick={() => setTab('duty')} style={{ cursor: 'pointer' }}>
                        📋 Duty ({attendance.length})
                    </a>
                    <a className={tab === 'breaks' ? 'active' : ''} onClick={() => setTab('breaks')} style={{ cursor: 'pointer' }}>
                        ☕ Breaks ({breaks.length})
                    </a>
                </nav>
                <div className="toolbar-spacer" />
                <button
                    type="button"
                    className="button button-ghost button-sm"
                    onClick={tab === 'duty' ? exportDutyCSV : exportBreaksCSV}
                    disabled={tab === 'duty' ? attendance.length === 0 : breaks.length === 0}
                >
                    📥 Export CSV
                </button>
            </div>

            {/* ── Duty Table ── */}
            {tab === 'duty' ? (
                <article className="card table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Employee</th>
                                <th>Group</th>
                                <th>Punch On</th>
                                <th>Punch Off</th>
                                <th>Status</th>
                                <th>Late</th>
                                <th>OT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendance.map(r => (
                                <tr key={r.id}>
                                    <td className="mono">{r.localDate}</td>
                                    <td>{r.user.displayName}</td>
                                    <td>{r.team?.name ? <span className="tag brand">{r.team.name}</span> : <span className="tag">Service</span>}</td>
                                    <td className="mono">{fmtTime(r.punchedOnAt)}</td>
                                    <td className="mono">{r.punchedOffAt ? fmtTime(r.punchedOffAt) : '—'}</td>
                                    <td><span className={`tag ${r.status === 'ACTIVE' ? 'ok' : ''}`}>{r.status}</span></td>
                                    <td>{r.lateMinutes > 0 ? <span className="tag danger">{r.lateMinutes}m</span> : '—'}</td>
                                    <td>{r.overtimeMinutes > 0 ? <span className="tag ok">{r.overtimeMinutes}m</span> : '—'}</td>
                                </tr>
                            ))}
                            {attendance.length === 0 ? (
                                <tr><td colSpan={8} style={{ color: 'var(--muted)', textAlign: 'center', padding: '1.5rem' }}>No duty records found for this period</td></tr>
                            ) : null}
                        </tbody>
                    </table>
                </article>
            ) : null}

            {/* ── Breaks Table ── */}
            {tab === 'breaks' ? (
                <article className="card table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Employee</th>
                                <th>Group</th>
                                <th>Code</th>
                                <th>Start</th>
                                <th>End</th>
                                <th>Expected</th>
                                <th>Actual</th>
                                <th>Status</th>
                                <th>OT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {breaks.map(b => (
                                <tr key={b.id}>
                                    <td className="mono">{b.localDate}</td>
                                    <td>{b.user.displayName}</td>
                                    <td>{b.user.team?.name ? <span className="tag brand">{b.user.team.name}</span> : '—'}</td>
                                    <td><span className="tag">{b.breakPolicy.code.toUpperCase()}</span></td>
                                    <td className="mono">{fmtTime(b.startedAt)}</td>
                                    <td className="mono">{b.endedAt ? fmtTime(b.endedAt) : '—'}</td>
                                    <td>{b.expectedDurationMinutes}m</td>
                                    <td>{b.actualMinutes !== null && b.actualMinutes !== undefined ? `${b.actualMinutes}m` : '—'}</td>
                                    <td>
                                        <span className={`tag ${b.status === 'ACTIVE' ? 'ok' : b.status === 'CANCELLED' ? 'danger' : ''}`}>
                                            {b.status}
                                        </span>
                                    </td>
                                    <td>{b.isOvertime ? <span className="tag warning">Yes</span> : '—'}</td>
                                </tr>
                            ))}
                            {breaks.length === 0 ? (
                                <tr><td colSpan={10} style={{ color: 'var(--muted)', textAlign: 'center', padding: '1.5rem' }}>No break records found for this period</td></tr>
                            ) : null}
                        </tbody>
                    </table>
                </article>
            ) : null}
        </AppShell>
    );
}
