'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { useModalKeyboard } from '@/hooks/use-modal-keyboard';

type ShiftRequestType = 'HALF_DAY_MORNING' | 'HALF_DAY_EVENING' | 'FULL_DAY_OFF' | 'CUSTOM';
type ViolationReason = 'LEFT_WITHOUT_PUNCH' | 'UNAUTHORIZED_ABSENCE' | 'OTHER';
type ViolationSource = 'MEMBER_REPORT' | 'LEADER_OBSERVED' | 'ADMIN_OBSERVED';
type ViolationStatus = 'PENDING' | 'LEADER_VALID' | 'LEADER_INVALID' | 'CONFIRMED' | 'REJECTED';

type ShiftChangeRequest = {
  id: string;
  user: { displayName: string; username: string };
  requestType: ShiftRequestType;
  requestedDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type DriverRequest = {
  id: string;
  user: { id: string; displayName: string; username: string };
  driver: { id: string; displayName: string; username: string } | null;
  requestedDate: string;
  requestedTime: string;
  destination: string;
  purpose: string | null;
  isRoundTrip: boolean;
  returnDate: string | null;
  returnTime: string | null;
  returnLocation: string | null;
  contactNumber: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';
};

const REQUEST_TYPE_LABEL: Record<ShiftRequestType, string> = {
  HALF_DAY_MORNING: 'Half Day - Morning Off',
  HALF_DAY_EVENING: 'Half Day - Afternoon Off',
  FULL_DAY_OFF: 'Full Day Off',
  CUSTOM: 'Custom'
};

const DRIVER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed'
};

const VIOLATION_REASON_LABEL: Record<ViolationReason, string> = {
  LEFT_WITHOUT_PUNCH: 'Left Without Punch',
  UNAUTHORIZED_ABSENCE: 'Unauthorized Absence',
  OTHER: 'Other',
};

const VIOLATION_SOURCE_LABEL: Record<ViolationSource, string> = {
  MEMBER_REPORT: 'Member Report',
  LEADER_OBSERVED: 'Leader Observed',
  ADMIN_OBSERVED: 'Admin Observed',
};

type ViolationCase = {
  id: string;
  source: ViolationSource;
  status: ViolationStatus;
  reason: ViolationReason;
  occurredAt: string;
  localDate: string;
  note: string | null;
  leaderReviewNote?: string | null;
  adminReviewNote?: string | null;
  createdAt: string;
  accusedUser: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    team?: { id: string; name: string } | null;
  };
  createdByUser: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    team?: { id: string; name: string } | null;
  };
  pointEntries: ViolationPointEntry[];
};

type ViolationPointEntry = {
  id: string;
  violationCaseId: string;
  type: 'REWARD' | 'DEDUCTION';
  reason: 'REPORT_REWARD' | 'ACCUSED_DEDUCTION' | 'COLLECTIVE_DEDUCTION';
  points: number;
  localDate: string;
  note: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    team?: { id: string; name: string } | null;
  };
  createdByUser?: { id: string; username: string; displayName: string } | null;
};

type AdminLiveBoard = {
  activeDutySessions: Array<{
    id: string;
    user: { id: string; displayName: string };
  }>;
};

type DriverUser = {
  id: string;
  displayName: string;
  username: string;
  role: string;
  driverStatus?: string;
};

const DRIVER_AVAIL_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  AVAILABLE: { emoji: '🚗', label: 'Available', color: 'var(--ok)', bg: 'rgba(34,197,94,0.12)' },
  BUSY:      { emoji: '🏎️', label: 'Driving',   color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' },
  ON_BREAK:  { emoji: '☕', label: 'On Break',  color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  OFFLINE:   { emoji: '🏠', label: 'Off Duty',  color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' },
};

export default function AdminRequestsPage() {
  return <Suspense><AdminRequestsContent /></Suspense>;
}

function getMonthRange(year: number, month: number): [string, string] {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const last = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return [from, to];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function AdminRequestsContent() {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const initialTab = tabFromQuery === 'driver' ? 'driver' : tabFromQuery === 'violation' ? 'violation' : 'shift';
  const [tab, setTab] = useState<'shift' | 'driver' | 'violation'>(initialTab);

  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([]);
  const [violationCases, setViolationCases] = useState<ViolationCase[]>([]);
  const [violationPoints, setViolationPoints] = useState<ViolationPointEntry[]>([]);
  const [activeDutyUsers, setActiveDutyUsers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [drivers, setDrivers] = useState<DriverUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const now = new Date();
  const [filterMode, setFilterMode] = useState<'month' | 'all' | 'custom'>('month');
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [violationStatusFilter, setViolationStatusFilter] = useState<'ALL' | ViolationStatus>('ALL');
  const [violationSourceFilter, setViolationSourceFilter] = useState<'ALL' | ViolationSource>('ALL');

  const [driverActionId, setDriverActionId] = useState<string | null>(null);
  const [driverApproveTarget, setDriverApproveTarget] = useState<DriverRequest | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [violationActionId, setViolationActionId] = useState<string | null>(null);
  const [selectedViolation, setSelectedViolation] = useState<ViolationCase | null>(null);
  const [showObservedViolationModal, setShowObservedViolationModal] = useState(false);
  const [observedAccusedUserId, setObservedAccusedUserId] = useState('');
  const [observedReason, setObservedReason] = useState<ViolationReason>('LEFT_WITHOUT_PUNCH');
  const [observedNote, setObservedNote] = useState('');
  const [finalizeDecision, setFinalizeDecision] = useState<'CONFIRMED' | 'REJECTED'>('CONFIRMED');
  const [accusedDeductionPoints, setAccusedDeductionPoints] = useState('0');
  const [reporterRewardPoints, setReporterRewardPoints] = useState('0');
  const [collectiveDeductionPoints, setCollectiveDeductionPoints] = useState('0');
  const [finalizeNote, setFinalizeNote] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const [requestsData, driverRequestsData, usersData, violationsData, pointsData, liveData] = await Promise.all([
        apiFetch<ShiftChangeRequest[]>('/admin/requests'),
        apiFetch<DriverRequest[]>('/admin/driver-requests'),
        apiFetch<DriverUser[]>('/admin/users'),
        apiFetch<ViolationCase[]>('/admin/violations?limit=200'),
        apiFetch<ViolationPointEntry[]>('/admin/violations/points?limit=500'),
        apiFetch<AdminLiveBoard>('/attendance/admin/live'),
      ]);
      setRequests(requestsData);
      setDriverRequests(driverRequestsData);
      setDrivers(usersData.filter((u) => u.role === 'DRIVER'));
      setViolationCases(violationsData);
      setViolationPoints(pointsData);
      setActiveDutyUsers(liveData.activeDutySessions.map((s) => s.user));
    } catch {
      if (!silent) setError('Failed to load requests');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void load(true);
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const requestsModalLayer = driverApproveTarget
    ? 'driver'
    : showObservedViolationModal
      ? 'observed'
      : selectedViolation
        ? 'finalize'
        : null;

  useModalKeyboard({
    open: requestsModalLayer === 'driver',
    onCancel: () => {
      setDriverApproveTarget(null);
      setSelectedDriverId('');
    },
    onConfirm: () => void confirmDriverApprove(),
    confirmDisabled: !!driverActionId || !selectedDriverId,
    submitWhenTyping: 'input-only',
  });

  useModalKeyboard({
    open: requestsModalLayer === 'observed',
    onCancel: () => {
      if (!violationActionId) setShowObservedViolationModal(false);
    },
    onConfirm: () => void submitObservedViolation(),
    confirmDisabled: !observedAccusedUserId || !!violationActionId,
    submitWhenTyping: 'input-only',
  });

  useModalKeyboard({
    open: requestsModalLayer === 'finalize',
    onCancel: () => {
      if (!violationActionId) setSelectedViolation(null);
    },
    onConfirm: () => void finalizeViolationCase(),
    confirmDisabled: !!violationActionId,
    submitWhenTyping: 'input-only',
  });

  async function rejectRequest(id: string) {
    setError(''); setMessage('');
    try {
      await apiFetch(`/admin/requests/${id}/reject`, { method: 'POST' });
      setMessage('Request rejected successfully');
      notifyPendingBadgesRefresh();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to reject'); }
  }

  async function approveRequest(id: string) {
    setError(''); setMessage('');
    try {
      await apiFetch(`/admin/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Request approved');
      notifyPendingBadgesRefresh();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to approve'); }
  }

  function openDriverApproveModal(req: DriverRequest) {
    setDriverApproveTarget(req);
    setSelectedDriverId(drivers[0]?.id || '');
    setError(''); setMessage('');
  }

  async function confirmDriverApprove() {
    if (!driverApproveTarget) return;
    if (!selectedDriverId) { setError('Please select a driver'); return; }
    setDriverActionId(driverApproveTarget.id); setError(''); setMessage('');
    try {
      await apiFetch(`/admin/driver-requests/${driverApproveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ driverId: selectedDriverId })
      });
      setMessage('Driver request approved and assigned');
      setDriverApproveTarget(null); setSelectedDriverId('');
      notifyPendingBadgesRefresh();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to approve'); }
    finally { setDriverActionId(null); }
  }

  async function rejectDriverRequest(id: string) {
    setDriverActionId(id); setError(''); setMessage('');
    try {
      await apiFetch(`/admin/driver-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Driver request rejected');
      notifyPendingBadgesRefresh();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to reject'); }
    finally { setDriverActionId(null); }
  }

  function toNonNegativeInt(value: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.trunc(parsed);
  }

  function openFinalizeViolationModal(item: ViolationCase) {
    setSelectedViolation(item);
    setFinalizeDecision('CONFIRMED');
    setAccusedDeductionPoints('0');
    setReporterRewardPoints('0');
    setCollectiveDeductionPoints('0');
    setFinalizeNote('');
    setError('');
  }

  async function submitObservedViolation(): Promise<void> {
    if (!observedAccusedUserId) {
      setError('Please select an accused user');
      return;
    }
    setViolationActionId('observed-create');
    setError('');
    setMessage('');
    try {
      await apiFetch('/admin/violations/observed', {
        method: 'POST',
        body: JSON.stringify({
          accusedUserId: observedAccusedUserId,
          reason: observedReason,
          note: observedNote.trim() || undefined,
        }),
      });
      setShowObservedViolationModal(false);
      setObservedAccusedUserId('');
      setObservedReason('LEFT_WITHOUT_PUNCH');
      setObservedNote('');
      setMessage('Observed incident created');
      notifyPendingBadgesRefresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create observed incident');
    } finally {
      setViolationActionId(null);
    }
  }

  async function finalizeViolationCase(): Promise<void> {
    if (!selectedViolation) return;
    setViolationActionId(selectedViolation.id);
    setError('');
    setMessage('');
    try {
      const body: Record<string, unknown> = {
        decision: finalizeDecision,
        note: finalizeNote.trim() || undefined,
      };
      if (finalizeDecision === 'CONFIRMED') {
        if (selectedViolation.source === 'MEMBER_REPORT') {
          body.accusedDeductionPoints = toNonNegativeInt(accusedDeductionPoints);
          body.reporterRewardPoints = toNonNegativeInt(reporterRewardPoints);
        } else {
          body.collectiveDeductionPoints = toNonNegativeInt(collectiveDeductionPoints);
        }
      }
      await apiFetch(`/admin/violations/${selectedViolation.id}/finalize`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSelectedViolation(null);
      setMessage(finalizeDecision === 'CONFIRMED' ? 'Violation confirmed and points recorded' : 'Violation rejected');
      notifyPendingBadgesRefresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize violation');
    } finally {
      setViolationActionId(null);
    }
  }

  function getDateFilterRange(): { from?: string; to?: string } {
    if (filterMode === 'all') return {};
    if (filterMode === 'month') {
      const [from, to] = getMonthRange(filterYear, filterMonth);
      return { from, to };
    }
    return {
      from: customFrom || undefined,
      to: customTo || undefined,
    };
  }

  function exportViolationPointsCsv(): void {
    const params = new URLSearchParams();
    const range = getDateFilterRange();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
    const url = `${apiBase}/admin/violations/points/export.csv?${params.toString()}`;

    const csrfMatch = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )csrf_token=([^;]*)/) : null;
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : '';

    void fetch(url, {
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to export CSV (${response.status})`);
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const disposition = response.headers.get('content-disposition') || '';
        const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
        link.href = blobUrl;
        link.download = filenameMatch?.[1] || 'violation-points.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to export CSV');
      });
  }

  function inRange(dateStr: string): boolean {
    if (filterMode === 'all') return true;
    const d = dateStr.slice(0, 10);
    if (filterMode === 'month') {
      const [from, to] = getMonthRange(filterYear, filterMonth);
      return d >= from && d <= to;
    }
    if (customFrom && d < customFrom) return false;
    if (customTo && d > customTo) return false;
    return true;
  }

  const filteredShifts = useMemo(() => requests.filter(r => inRange(r.requestedDate)), [requests, filterMode, filterYear, filterMonth, customFrom, customTo]);
  const filteredDriverReqs = useMemo(() => driverRequests.filter(r => inRange(r.requestedDate)), [driverRequests, filterMode, filterYear, filterMonth, customFrom, customTo]);
  const filteredViolations = useMemo(
    () =>
      violationCases.filter((v) => {
        if (!inRange(v.localDate)) return false;
        if (violationStatusFilter !== 'ALL' && v.status !== violationStatusFilter) return false;
        if (violationSourceFilter !== 'ALL' && v.source !== violationSourceFilter) return false;
        return true;
      }),
    [
      violationCases,
      filterMode,
      filterYear,
      filterMonth,
      customFrom,
      customTo,
      violationStatusFilter,
      violationSourceFilter,
    ]
  );
  const filteredViolationPoints = useMemo(
    () => violationPoints.filter((p) => inRange(p.localDate)),
    [violationPoints, filterMode, filterYear, filterMonth, customFrom, customTo]
  );

  const pendingShifts = useMemo(() => filteredShifts.filter(r => r.status === 'PENDING'), [filteredShifts]);
  const resolvedShifts = useMemo(() => filteredShifts.filter(r => r.status !== 'PENDING'), [filteredShifts]);
  const pendingDriverReqs = useMemo(() => filteredDriverReqs.filter(r => r.status === 'PENDING'), [filteredDriverReqs]);
  const resolvedDriverReqs = useMemo(() => filteredDriverReqs.filter(r => r.status !== 'PENDING'), [filteredDriverReqs]);
  const pendingViolations = useMemo(
    () => filteredViolations.filter((v) => v.status !== 'CONFIRMED' && v.status !== 'REJECTED'),
    [filteredViolations]
  );
  const resolvedViolations = useMemo(
    () => filteredViolations.filter((v) => v.status === 'CONFIRMED' || v.status === 'REJECTED'),
    [filteredViolations]
  );
  const violationDeductionPoints = useMemo(
    () =>
      filteredViolationPoints
        .filter((p) => p.type === 'DEDUCTION')
        .reduce((sum, p) => sum + p.points, 0),
    [filteredViolationPoints]
  );
  const violationRewardPoints = useMemo(
    () =>
      filteredViolationPoints
        .filter((p) => p.type === 'REWARD')
        .reduce((sum, p) => sum + p.points, 0),
    [filteredViolationPoints]
  );
  const approvedShifts = useMemo(() => filteredShifts.filter(r => r.status === 'APPROVED').length, [filteredShifts]);
  const rejectedShifts = useMemo(() => filteredShifts.filter(r => r.status === 'REJECTED').length, [filteredShifts]);
  const approvedDrivers = useMemo(() => filteredDriverReqs.filter(r => r.status === 'APPROVED' || r.status === 'IN_PROGRESS' || r.status === 'COMPLETED').length, [filteredDriverReqs]);
  const rejectedDrivers = useMemo(() => filteredDriverReqs.filter(r => r.status === 'REJECTED').length, [filteredDriverReqs]);
  const resolvedViolationPointCount = useMemo(
    () =>
      selectedViolation && selectedViolation.source !== 'MEMBER_REPORT'
        ? activeDutyUsers.length
        : 0,
    [activeDutyUsers.length, selectedViolation]
  );

  function prevMonth() { if (filterMonth === 0) { setFilterMonth(11); setFilterYear(y => y - 1); } else setFilterMonth(m => m - 1); }
  function nextMonth() { if (filterMonth === 11) { setFilterMonth(0); setFilterYear(y => y + 1); } else setFilterMonth(m => m + 1); }

  function notifyPendingBadgesRefresh() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('pending-badges:refresh'));
  }

  return (
    <AppShell title="Requests" subtitle="Approve or reject day off and driver requests" admin userRole="ADMIN">
      <div className="dash-layout">
        {message ? <div className="alert alert-success">{message}</div> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        {/* ═══ Date Filter ═══ */}
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <nav className="nav">
            <a style={{ cursor: 'pointer', userSelect: 'none', padding: '0.25rem 0.4rem', fontSize: '0.8rem' }} onClick={prevMonth}>‹</a>
            <a
              className={filterMode === 'month' ? 'active' : ''}
              style={{ cursor: 'pointer', fontWeight: 600, minWidth: '5.5rem', textAlign: 'center' }}
              onClick={() => setFilterMode('month')}
            >
              {MONTH_NAMES[filterMonth]} {filterYear}
            </a>
            <a style={{ cursor: 'pointer', userSelect: 'none', padding: '0.25rem 0.4rem', fontSize: '0.8rem' }} onClick={nextMonth}>›</a>
            <a className={filterMode === 'all' ? 'active' : ''} style={{ cursor: 'pointer' }} onClick={() => setFilterMode('all')}>All</a>
            <a className={filterMode === 'custom' ? 'active' : ''} style={{ cursor: 'pointer' }} onClick={() => setFilterMode('custom')}>Range</a>
          </nav>
          {filterMode === 'custom' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
              <input type="date" className="input" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem' }} value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setFilterMode('custom'); }} />
              <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>–</span>
              <input type="date" className="input" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem' }} value={customTo} onChange={(e) => { setCustomTo(e.target.value); setFilterMode('custom'); }} />
            </div>
          ) : (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)' }}>
              {filterMode === 'all' ? 'All time' : filterMode === 'month' && filterYear === now.getFullYear() && filterMonth === now.getMonth() ? 'This month' : `${MONTH_NAMES[filterMonth]} ${filterYear}`}
            </span>
          )}
        </div>

        {/* ═══ Tab Selectors ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setTab('shift')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-lg)',
              background: tab === 'shift' ? 'var(--brand)' : 'var(--card)',
              border: tab === 'shift' ? '1px solid var(--brand)' : '1px solid var(--line)',
              color: tab === 'shift' ? '#fff' : 'var(--ink)',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.8 }}>Day Off Requests</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.7 }}>
                {approvedShifts} approved · {rejectedShifts} rejected
              </div>
            </div>
            {pendingShifts.length > 0 ? (
              <span style={{ background: tab === 'shift' ? 'rgba(255,255,255,0.25)' : 'var(--danger)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', minWidth: '1.5rem', textAlign: 'center' }}>
                {pendingShifts.length}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>0 pending</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('driver')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-lg)',
              background: tab === 'driver' ? 'var(--brand)' : 'var(--card)',
              border: tab === 'driver' ? '1px solid var(--brand)' : '1px solid var(--line)',
              color: tab === 'driver' ? '#fff' : 'var(--ink)',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.8 }}>Driver Requests</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.7 }}>
                {approvedDrivers} approved · {rejectedDrivers} rejected
              </div>
            </div>
            {pendingDriverReqs.length > 0 ? (
              <span style={{ background: tab === 'driver' ? 'rgba(255,255,255,0.25)' : 'var(--danger)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', minWidth: '1.5rem', textAlign: 'center' }}>
                {pendingDriverReqs.length}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>0 pending</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('violation')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-lg)',
              background: tab === 'violation' ? 'var(--brand)' : 'var(--card)',
              border: tab === 'violation' ? '1px solid var(--brand)' : '1px solid var(--line)',
              color: tab === 'violation' ? '#fff' : 'var(--ink)',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.8 }}>Violations</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.7 }}>
                +{violationRewardPoints} reward · -{violationDeductionPoints} deduction
              </div>
            </div>
            {pendingViolations.length > 0 ? (
              <span style={{ background: tab === 'violation' ? 'rgba(255,255,255,0.25)' : 'var(--danger)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', minWidth: '1.5rem', textAlign: 'center' }}>
                {pendingViolations.length}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>0 pending</span>
            )}
          </button>
        </div>

        {/* ═══ SHIFT TAB ═══ */}
        {tab === 'shift' ? (
          <>
            {/* Pending shift requests as cards */}
            {pendingShifts.length > 0 ? (
              <section className="dash-section">
                <h2 className="dash-section-title">
                  Pending Day Off Requests <span className="dash-badge">{pendingShifts.length}</span>
                </h2>
                <div className="dash-cards">
                  {pendingShifts.map(req => (
                    <article key={req.id} className="card" style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{req.user.displayName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                          <button
                            className="button button-sm button-ok"
                            disabled={loading}
                            onClick={() => void approveRequest(req.id)}
                          >
                            Approve
                          </button>
                          <button className="button button-sm button-danger" disabled={loading} onClick={() => void rejectRequest(req.id)}>
                            Reject
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        <span className="tag">{REQUEST_TYPE_LABEL[req.requestType]}</span>
                        <span className="mono">{new Date(req.requestedDate).toLocaleDateString()}</span>
                      </div>
                      {req.reason ? <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--muted)' }}>{req.reason}</div> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Resolved shift history */}
            <section className="dash-section">
              <h2 className="dash-section-title">Day Off Request History</h2>
              <article className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Reason</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedShifts.map(req => (
                        <tr key={req.id}>
                          <td>
                            <div>{req.user.displayName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                          </td>
                          <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                          <td>{REQUEST_TYPE_LABEL[req.requestType]}</td>
                          <td>{req.reason || '-'}</td>
                          <td>
                            <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : ''}`}>
                              {req.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {resolvedShifts.length === 0 ? (
                        <tr><td colSpan={5} className="table-empty">No resolved requests yet</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

          </>
        ) : tab === 'driver' ? (
          <>
            {/* ═══ DRIVER TAB ═══ */}

            {/* Driver Availability */}
            <section className="dash-section">
              <h2 className="dash-section-title">Driver Availability</h2>
              {drivers.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No drivers found.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '0.5rem' }}>
                  {drivers.map(d => {
                    const status = d.driverStatus || 'OFFLINE';
                    const cfg = DRIVER_AVAIL_CONFIG[status] || DRIVER_AVAIL_CONFIG.OFFLINE;
                    return (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 0.75rem', background: cfg.bg, borderRadius: 'var(--radius)', border: '1px solid transparent' }}>
                        <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.displayName}</div>
                          <div style={{ fontSize: '0.75rem', color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Pending driver requests as cards */}
            {pendingDriverReqs.length > 0 ? (
              <section className="dash-section">
                <h2 className="dash-section-title">
                  Pending Driver Requests <span className="dash-badge">{pendingDriverReqs.length}</span>
                </h2>
                <div className="dash-cards">
                  {pendingDriverReqs.map(req => (
                    <article key={req.id} className="card" style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{req.user.displayName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                          <button className="button button-sm button-ok" disabled={loading || driverActionId === req.id} onClick={() => openDriverApproveModal(req)}>Approve</button>
                          <button className="button button-sm button-danger" disabled={loading || driverActionId === req.id} onClick={() => void rejectDriverRequest(req.id)}>Reject</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        <span className="mono">{new Date(req.requestedDate).toLocaleDateString()}</span>
                        <span className="mono">{req.requestedTime}</span>
                        <span>{req.destination}</span>
                        {req.isRoundTrip ? <span className="tag brand" style={{ fontSize: '0.7rem' }}>Round trip</span> : null}
                      </div>
                      {req.isRoundTrip && (req.returnDate || req.returnTime || req.returnLocation) ? (
                        <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                          Return: {req.returnDate ? new Date(req.returnDate).toLocaleDateString() : ''} {req.returnTime || ''} {req.returnLocation ? `@ ${req.returnLocation}` : ''}
                        </div>
                      ) : null}
                      {req.contactNumber ? <div style={{ marginTop: '0.15rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Tel: {req.contactNumber}</div> : null}
                      {req.purpose ? <div style={{ marginTop: '0.15rem', fontSize: '0.78rem', color: 'var(--muted)' }}>{req.purpose}</div> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Resolved driver history */}
            <section className="dash-section">
              <h2 className="dash-section-title">Driver Request History</h2>
              <article className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Destination</th>
                        <th>Info</th>
                        <th>Status</th>
                        <th>Driver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedDriverReqs.map(req => (
                        <tr key={req.id}>
                          <td>
                            <div>{req.user.displayName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                          </td>
                          <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                          <td className="mono">{req.requestedTime}</td>
                          <td>{req.destination}</td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                            {req.isRoundTrip ? (
                              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <span className="tag brand" style={{ fontSize: '0.7rem' }}>Round trip</span>
                                {req.returnDate || req.returnTime ? <span>Return: {req.returnDate ? new Date(req.returnDate).toLocaleDateString() : ''} {req.returnTime || ''}</span> : null}
                                {req.returnLocation ? <span>{req.returnLocation}</span> : null}
                              </span>
                            ) : null}
                            {req.contactNumber ? <span style={{ display: 'block' }}>Tel: {req.contactNumber}</span> : null}
                            {req.purpose ? <span style={{ display: 'block' }}>{req.purpose}</span> : null}
                            {!req.isRoundTrip && !req.contactNumber && !req.purpose ? '-' : null}
                          </td>
                          <td>
                            <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : req.status === 'IN_PROGRESS' ? 'warning' : req.status === 'COMPLETED' ? 'brand' : ''}`}>
                              {DRIVER_STATUS_LABEL[req.status] || req.status}
                            </span>
                          </td>
                          <td>{req.driver?.displayName || '-'}</td>
                        </tr>
                      ))}
                      {resolvedDriverReqs.length === 0 ? (
                        <tr><td colSpan={7} className="table-empty">No resolved driver requests</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </>
        ) : (
          <>
            <section className="dash-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <h2 className="dash-section-title" style={{ marginBottom: 0 }}>Violation Cases</h2>
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    style={{ minWidth: '10rem' }}
                    value={violationStatusFilter}
                    onChange={(e) => setViolationStatusFilter(e.target.value as 'ALL' | ViolationStatus)}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="LEADER_VALID">Leader Valid</option>
                    <option value="LEADER_INVALID">Leader Invalid</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                  <select
                    className="select"
                    style={{ minWidth: '10rem' }}
                    value={violationSourceFilter}
                    onChange={(e) => setViolationSourceFilter(e.target.value as 'ALL' | ViolationSource)}
                  >
                    <option value="ALL">All sources</option>
                    <option value="MEMBER_REPORT">Member Report</option>
                    <option value="LEADER_OBSERVED">Leader Observed</option>
                    <option value="ADMIN_OBSERVED">Admin Observed</option>
                  </select>
                  <button
                    type="button"
                    className="button button-danger button-sm"
                    disabled={activeDutyUsers.length === 0 || !!violationActionId}
                    onClick={() => {
                      if (!observedAccusedUserId && activeDutyUsers.length > 0) {
                        setObservedAccusedUserId(activeDutyUsers[0].id);
                      }
                      setShowObservedViolationModal(true);
                    }}
                  >
                    Observed Incident
                  </button>
                </div>
              </div>
            </section>

            <section className="dash-section">
              <h2 className="dash-section-title">
                Pending Violations <span className="dash-badge">{pendingViolations.length}</span>
              </h2>
              {pendingViolations.length > 0 ? (
                <div className="dash-cards">
                  {pendingViolations.map((item) => (
                    <article key={item.id} className="card" style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {item.accusedUser.displayName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            @{item.accusedUser.username} · {item.accusedUser.team?.name || 'No Team'}
                          </div>
                        </div>
                        <span className={`tag ${item.status === 'LEADER_VALID' ? 'ok' : item.status === 'LEADER_INVALID' ? 'danger' : 'warning'}`}>
                          {item.status}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.55rem', fontSize: '0.78rem' }}>
                        <span className="tag">{VIOLATION_SOURCE_LABEL[item.source]}</span>
                        <span className="tag">{VIOLATION_REASON_LABEL[item.reason]}</span>
                        <span className="mono">{item.localDate}</span>
                        <span className="mono">{new Date(item.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                        Reporter: {item.source === 'MEMBER_REPORT' ? `${item.createdByUser.displayName} (@${item.createdByUser.username})` : 'N/A (observed)'}
                      </div>
                      {item.leaderReviewNote ? (
                        <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                          Leader note: {item.leaderReviewNote}
                        </div>
                      ) : null}
                      {item.note ? (
                        <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                          Case note: {item.note}
                        </div>
                      ) : null}

                      <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="button button-primary button-sm"
                          disabled={!!violationActionId}
                          onClick={() => openFinalizeViolationModal(item)}
                        >
                          Finalize
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <article className="card">
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>No pending violations for this filter.</p>
                </article>
              )}
            </section>

            <section className="dash-section">
              <h2 className="dash-section-title">Resolved Violations</h2>
              <article className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Accused</th>
                        <th>Source</th>
                        <th>Reason</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Reporter</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedViolations.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div>{item.accusedUser.displayName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{item.accusedUser.username}</div>
                          </td>
                          <td>{VIOLATION_SOURCE_LABEL[item.source]}</td>
                          <td>{VIOLATION_REASON_LABEL[item.reason]}</td>
                          <td className="mono">{item.localDate}</td>
                          <td>
                            <span className={`tag ${item.status === 'CONFIRMED' ? 'ok' : 'danger'}`}>
                              {item.status}
                            </span>
                          </td>
                          <td>
                            {item.source === 'MEMBER_REPORT'
                              ? `${item.createdByUser.displayName} (@${item.createdByUser.username})`
                              : 'N/A'}
                          </td>
                          <td>
                            {item.pointEntries.length > 0
                              ? `${item.pointEntries.length} entries`
                              : '-'}
                          </td>
                        </tr>
                      ))}
                      {resolvedViolations.length === 0 ? (
                        <tr><td colSpan={7} className="table-empty">No resolved violations</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <section className="dash-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 className="dash-section-title" style={{ marginBottom: 0 }}>Points Ledger</h2>
                <button type="button" className="button button-ghost button-sm" onClick={exportViolationPointsCsv}>
                  Export CSV
                </button>
              </div>
              <article className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>User</th>
                        <th>Type</th>
                        <th>Reason</th>
                        <th>Points</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredViolationPoints.map((entry) => (
                        <tr key={entry.id}>
                          <td className="mono">{entry.localDate}</td>
                          <td>
                            <div>{entry.user.displayName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                              @{entry.user.username} · {entry.user.team?.name || 'No Team'}
                            </div>
                          </td>
                          <td>
                            <span className={`tag ${entry.type === 'REWARD' ? 'ok' : 'danger'}`}>
                              {entry.type}
                            </span>
                          </td>
                          <td>{entry.reason}</td>
                          <td className="mono">{entry.points}</td>
                          <td>{entry.createdByUser?.displayName || '-'}</td>
                        </tr>
                      ))}
                      {filteredViolationPoints.length === 0 ? (
                        <tr><td colSpan={6} className="table-empty">No points entries for this filter</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </>
        )}

        {/* Driver approve modal */}
        {driverApproveTarget ? (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDriverApproveTarget(null); setSelectedDriverId(''); } }}>
            <div className="modal">
              <h3>Approve &amp; Assign Driver</h3>
              <p style={{ marginBottom: '0.65rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                <strong>{driverApproveTarget.user.displayName}</strong> requested a driver to{' '}
                <strong>{driverApproveTarget.destination}</strong> on{' '}
                <strong>{new Date(driverApproveTarget.requestedDate).toLocaleDateString()}</strong> at{' '}
                <strong>{driverApproveTarget.requestedTime}</strong>.
                {driverApproveTarget.purpose ? <span> Reason: {driverApproveTarget.purpose}</span> : null}
                {driverApproveTarget.contactNumber ? <span> | Tel: {driverApproveTarget.contactNumber}</span> : null}
              </p>
              {driverApproveTarget.isRoundTrip ? (
                <div style={{ marginBottom: '0.65rem', padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}>
                  <strong style={{ color: 'var(--brand)' }}>Round Trip</strong>
                  {driverApproveTarget.returnDate ? <span> | Date: {new Date(driverApproveTarget.returnDate).toLocaleDateString()}</span> : null}
                  {driverApproveTarget.returnTime ? <span> | Time: {driverApproveTarget.returnTime}</span> : null}
                  {driverApproveTarget.returnLocation ? <span> | Pickup: {driverApproveTarget.returnLocation}</span> : null}
                </div>
              ) : null}
              <label style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>Assign to Driver</label>
              <select className="select" value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)}>
                <option value="">Select a driver…</option>
                {drivers.map(d => {
                  const status = d.driverStatus || 'OFFLINE';
                  const cfg = DRIVER_AVAIL_CONFIG[status] || DRIVER_AVAIL_CONFIG.OFFLINE;
                  return <option key={d.id} value={d.id}>{cfg.emoji} {d.displayName} — {cfg.label}</option>;
                })}
              </select>
              <div className="modal-footer">
                <button type="button" className="button button-ghost" onClick={() => { setDriverApproveTarget(null); setSelectedDriverId(''); }}>Cancel</button>
                <button type="button" className="button button-primary" disabled={!!driverActionId || !selectedDriverId} onClick={() => void confirmDriverApprove()}>
                  {driverActionId ? 'Approving…' : 'Approve & Assign'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showObservedViolationModal ? (
          <div
            className="modal-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget && !violationActionId) {
                setShowObservedViolationModal(false);
              }
            }}
          >
            <div className="modal">
              <h3>Create Observed Incident</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.6rem' }}>
                Use this when no member report was submitted.
              </p>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Accused User (Active Duty)</label>
              <select
                className="select"
                value={observedAccusedUserId}
                onChange={(e) => setObservedAccusedUserId(e.target.value)}
                disabled={!!violationActionId}
              >
                {activeDutyUsers.map((option) => (
                  <option key={option.id} value={option.id}>{option.displayName}</option>
                ))}
              </select>

              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.6rem' }}>Reason</label>
              <select
                className="select"
                value={observedReason}
                onChange={(e) => setObservedReason(e.target.value as ViolationReason)}
                disabled={!!violationActionId}
              >
                <option value="LEFT_WITHOUT_PUNCH">Left Without Punch</option>
                <option value="UNAUTHORIZED_ABSENCE">Unauthorized Absence</option>
                <option value="OTHER">Other</option>
              </select>

              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.6rem' }}>Note (optional)</label>
              <textarea
                className="input"
                rows={3}
                maxLength={200}
                value={observedNote}
                onChange={(e) => setObservedNote(e.target.value)}
                disabled={!!violationActionId}
                placeholder="Short note (optional)"
              />

              <div className="modal-footer">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setShowObservedViolationModal(false)}
                  disabled={!!violationActionId}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  disabled={!observedAccusedUserId || !!violationActionId}
                  onClick={() => void submitObservedViolation()}
                >
                  {violationActionId === 'observed-create' ? 'Submitting…' : 'Submit Incident'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {selectedViolation ? (
          <div
            className="modal-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget && !violationActionId) {
                setSelectedViolation(null);
              }
            }}
          >
            <div className="modal">
              <h3>Finalize Violation Case</h3>
              <p style={{ marginBottom: '0.5rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
                {selectedViolation.accusedUser.displayName} · {VIOLATION_SOURCE_LABEL[selectedViolation.source]} · {VIOLATION_REASON_LABEL[selectedViolation.reason]}
              </p>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Decision</label>
              <select
                className="select"
                value={finalizeDecision}
                onChange={(e) => setFinalizeDecision(e.target.value as 'CONFIRMED' | 'REJECTED')}
                disabled={!!violationActionId}
              >
                <option value="CONFIRMED">Confirm</option>
                <option value="REJECTED">Reject</option>
              </select>

              {finalizeDecision === 'CONFIRMED' && selectedViolation.source === 'MEMBER_REPORT' ? (
                <div style={{ marginTop: '0.6rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Accused Deduction Points</label>
                    <input
                      type="number"
                      min={0}
                      className="input"
                      value={accusedDeductionPoints}
                      onChange={(e) => setAccusedDeductionPoints(e.target.value)}
                      disabled={!!violationActionId}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Reporter Reward Points</label>
                    <input
                      type="number"
                      min={0}
                      className="input"
                      value={reporterRewardPoints}
                      onChange={(e) => setReporterRewardPoints(e.target.value)}
                      disabled={!!violationActionId}
                    />
                  </div>
                </div>
              ) : null}

              {finalizeDecision === 'CONFIRMED' && selectedViolation.source !== 'MEMBER_REPORT' ? (
                <div style={{ marginTop: '0.6rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Collective Deduction Points (required)</label>
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={collectiveDeductionPoints}
                    onChange={(e) => setCollectiveDeductionPoints(e.target.value)}
                    disabled={!!violationActionId}
                  />
                  <p style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Preview: {resolvedViolationPointCount} currently active users. Final impacted count is resolved at incident time.
                  </p>
                </div>
              ) : null}

              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.6rem' }}>Admin Note (optional)</label>
              <textarea
                className="input"
                rows={3}
                maxLength={300}
                value={finalizeNote}
                onChange={(e) => setFinalizeNote(e.target.value)}
                disabled={!!violationActionId}
                placeholder="Short review note"
              />

              <div className="modal-footer">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setSelectedViolation(null)}
                  disabled={!!violationActionId}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`button ${finalizeDecision === 'CONFIRMED' ? 'button-primary' : 'button-danger'}`}
                  disabled={!!violationActionId}
                  onClick={() => void finalizeViolationCase()}
                >
                  {violationActionId === selectedViolation.id ? 'Saving…' : finalizeDecision === 'CONFIRMED' ? 'Confirm Case' : 'Reject Case'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
