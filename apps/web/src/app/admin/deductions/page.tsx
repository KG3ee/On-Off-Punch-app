'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

type DeductionCategory = 'PUNCH_LATE' | 'BREAK_LATE';

type Team = { id: string; name: string };
type UserRef = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive?: boolean;
  team?: { id: string; name: string } | null;
};

type DeductionTier = {
  id: string;
  occurrenceNo: number;
  amountAed: number;
};

type DeductionPolicyConfig = {
  effectiveFromLocalDate: string | null;
  tiers: DeductionTier[];
};

type PoliciesResponse = {
  policies: Record<DeductionCategory, DeductionPolicyConfig>;
};

type DeductionSummaryRow = {
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    team: { id: string; name: string } | null;
  };
  punchLateEvents: number;
  breakLateEvents: number;
  punchLateAed: number;
  breakLateAed: number;
  totalAed: number;
};

type DeductionSummaryResponse = {
  totals: {
    totalAed: number;
    usersAffected: number;
    punchLateAed: number;
    breakLateAed: number;
    punchLateEvents: number;
    breakLateEvents: number;
  };
  rows: DeductionSummaryRow[];
};

type DeductionEntry = {
  id: string;
  userId: string;
  category: DeductionCategory;
  sourceType: 'DUTY_SESSION' | 'BREAK_SESSION';
  sourceId: string;
  localDate: string;
  periodMonth: string;
  occurrenceNo: number;
  amountAed: number;
  currency: string;
  lateMinutesSnapshot: number | null;
  breakOvertimeMinutesSnapshot: number | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    team: { id: string; name: string } | null;
  };
};

type DeductionEntriesResponse = {
  total: number;
  items: DeductionEntry[];
};

const CATEGORY_LABEL: Record<DeductionCategory, string> = {
  PUNCH_LATE: 'Punch Late',
  BREAK_LATE: 'Break Late',
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function fmtMoney(value: number): string {
  return `${value.toFixed(2)} AED`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminDeductionsPage() {
  const now = new Date();
  const [filterMode, setFilterMode] = useState<'month' | 'all' | 'custom'>('month');
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [teamId, setTeamId] = useState('');
  const [userId, setUserId] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | DeductionCategory>('ALL');

  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);

  const [policyDrafts, setPolicyDrafts] = useState<Record<DeductionCategory, {
    amountsAed: string[];
    effectiveFromLocalDate: string;
  }>>({
    PUNCH_LATE: {
      amountsAed: [],
      effectiveFromLocalDate: '',
    },
    BREAK_LATE: {
      amountsAed: [],
      effectiveFromLocalDate: '',
    },
  });

  const [summary, setSummary] = useState<DeductionSummaryResponse | null>(null);
  const [entries, setEntries] = useState<DeductionEntry[]>([]);
  const [entriesTotal, setEntriesTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [savingCategory, setSavingCategory] = useState<DeductionCategory | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedMonthKey = useMemo(
    () => toMonthKey(filterYear, filterMonth),
    [filterMonth, filterYear],
  );

  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => user.isActive !== false)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users]);

  const buildParams = useCallback(
    (withPagination: boolean): URLSearchParams => {
      const params = new URLSearchParams();
      if (filterMode === 'month') {
        params.set('periodMonth', selectedMonthKey);
      } else if (filterMode === 'custom') {
        if (customFrom) params.set('from', customFrom);
        if (customTo) params.set('to', customTo);
      }

      if (teamId) params.set('teamId', teamId);
      if (userId) params.set('userId', userId);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);

      if (withPagination) {
        params.set('limit', '500');
        params.set('offset', '0');
      }

      return params;
    },
    [categoryFilter, customFrom, customTo, filterMode, selectedMonthKey, teamId, userId],
  );

  const loadPolicies = useCallback(async () => {
    const result = await apiFetch<PoliciesResponse>('/admin/deductions/policies');
    setPolicyDrafts({
      PUNCH_LATE: {
        amountsAed: result.policies.PUNCH_LATE.tiers.map((tier) => tier.amountAed.toFixed(2)),
        effectiveFromLocalDate: result.policies.PUNCH_LATE.effectiveFromLocalDate || '',
      },
      BREAK_LATE: {
        amountsAed: result.policies.BREAK_LATE.tiers.map((tier) => tier.amountAed.toFixed(2)),
        effectiveFromLocalDate: result.policies.BREAK_LATE.effectiveFromLocalDate || '',
      },
    });
  }, []);

  const loadFilters = useCallback(async () => {
    const [teamData, userData] = await Promise.all([
      apiFetch<Team[]>('/teams'),
      apiFetch<UserRef[]>('/admin/users'),
    ]);
    setTeams(teamData);
    setUsers(userData);
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
      setMessage('');
    }

    try {
      const summaryParams = buildParams(false);
      const entriesParams = buildParams(true);
      const [summaryData, entriesData] = await Promise.all([
        apiFetch<DeductionSummaryResponse>(`/admin/deductions/summary?${summaryParams.toString()}`),
        apiFetch<DeductionEntriesResponse>(`/admin/deductions/entries?${entriesParams.toString()}`),
      ]);

      setSummary(summaryData);
      setEntries(entriesData.items);
      setEntriesTotal(entriesData.total);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load deduction data');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError('');
      try {
        await Promise.all([loadFilters(), loadPolicies()]);
        await loadData(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize deductions page');
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [loadData, loadFilters, loadPolicies]);

  async function applyFilters(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    await loadData();
  }

  function addTier(category: DeductionCategory) {
    setPolicyDrafts((current) => ({
      ...current,
      [category]: {
        ...current[category],
        amountsAed: [...current[category].amountsAed, '0.00'],
      },
    }));
  }

  function removeTier(category: DeductionCategory, index: number) {
    setPolicyDrafts((current) => {
      const next = [...current[category].amountsAed];
      next.splice(index, 1);
      return {
        ...current,
        [category]: {
          ...current[category],
          amountsAed: next,
        },
      };
    });
  }

  function updateTierAmount(category: DeductionCategory, index: number, value: string) {
    setPolicyDrafts((current) => {
      const next = [...current[category].amountsAed];
      next[index] = value;
      return {
        ...current,
        [category]: {
          ...current[category],
          amountsAed: next,
        },
      };
    });
  }

  function updateEffectiveFromDate(category: DeductionCategory, value: string) {
    setPolicyDrafts((current) => {
      return {
        ...current,
        [category]: {
          ...current[category],
          effectiveFromLocalDate: value,
        },
      };
    });
  }

  async function savePolicy(category: DeductionCategory) {
    setError('');
    setMessage('');

    const draft = policyDrafts[category];
    const amounts = draft.amountsAed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    if (amounts.length === 0) {
      setError(`${CATEGORY_LABEL[category]} policy needs at least one tier`);
      return;
    }

    if (amounts.some((value) => value < 0)) {
      setError('Tier amounts must be 0 or greater');
      return;
    }

    setSavingCategory(category);
    try {
      await apiFetch(`/admin/deductions/policies/${category}`, {
        method: 'PUT',
        body: JSON.stringify({
          amountsAed: amounts,
          effectiveFromLocalDate: draft.effectiveFromLocalDate || null,
        }),
      });

      setMessage(`${CATEGORY_LABEL[category]} policy saved`);
      await Promise.all([loadPolicies(), loadData(true)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save policy');
    } finally {
      setSavingCategory(null);
    }
  }

  function exportCsv() {
    const token = getAccessToken();
    if (!token) {
      setError('Missing authorization token. Please login again.');
      return;
    }

    const params = buildParams(false);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
    const url = `${apiBase}/admin/deductions/export.csv?${params.toString()}`;

    void fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
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
        link.download = filenameMatch?.[1] || 'deductions.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to export CSV');
      });
  }

  return (
    <AppShell title="Deductions" subtitle="AED deduction policy and monthly summary" admin userRole="ADMIN">
      {error ? <div className="alert alert-error">⚠ {error}</div> : null}
      {message ? <div className="alert alert-success">✓ {message}</div> : null}

      <section className="card" style={{ marginBottom: '0.9rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.4rem' }}>Policy Editor</h3>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
          Counts reset monthly. If user events exceed configured tiers, the last tier amount is reused.
        </p>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {(['PUNCH_LATE', 'BREAK_LATE'] as DeductionCategory[]).map((category) => {
            const draft = policyDrafts[category];
            return (
              <article key={category} className="card" style={{ margin: 0 }}>
                <h4 style={{ marginTop: 0 }}>{CATEGORY_LABEL[category]}</h4>
                {draft.amountsAed.length === 0 ? (
                  <div className="alert alert-warning" style={{ marginBottom: '0.5rem' }}>
                    No tiers configured yet. Add at least one tier.
                  </div>
                ) : null}

                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
                    Effective Start Date (optional)
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={draft.effectiveFromLocalDate}
                    onChange={(e) => updateEffectiveFromDate(category, e.target.value)}
                    style={{ maxWidth: '170px' }}
                  />
                  <div style={{ color: 'var(--muted)', fontSize: '0.74rem', marginTop: '0.2rem' }}>
                    Occurrence counting starts from this date. Leave empty to count the full month.
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  {draft.amountsAed.map((value, index) => (
                    <div key={`${category}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="tag" style={{ minWidth: '72px', textAlign: 'center' }}>#{index + 1}</span>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={value}
                        onChange={(e) => updateTierAmount(category, index, e.target.value)}
                        placeholder="0.00"
                        style={{ maxWidth: '150px' }}
                      />
                      <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>AED</span>
                      <button
                        type="button"
                        className="button button-danger button-sm"
                        onClick={() => removeTier(category, index)}
                        disabled={draft.amountsAed.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="toolbar" style={{ marginTop: '0.6rem' }}>
                  <button
                    type="button"
                    className="button button-ghost button-sm"
                    onClick={() => addTier(category)}
                  >
                    + Add Tier
                  </button>
                  <div className="toolbar-spacer" />
                  <button
                    type="button"
                    className="button button-primary button-sm"
                    onClick={() => void savePolicy(category)}
                    disabled={savingCategory === category}
                  >
                    {savingCategory === category ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <form className="card" onSubmit={(e) => void applyFilters(e)}>
        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          <select
            className="select"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as 'month' | 'all' | 'custom')}
            style={{ width: '160px' }}
          >
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
            <option value="all">All Time</option>
          </select>

          {filterMode === 'month' ? (
            <>
              <select
                className="select"
                value={filterMonth}
                onChange={(e) => setFilterMonth(Number(e.target.value))}
                style={{ width: '120px' }}
              >
                {MONTH_NAMES.map((month, index) => (
                  <option key={month} value={index}>{month}</option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                value={filterYear}
                onChange={(e) => setFilterYear(Number(e.target.value))}
                style={{ width: '100px' }}
              />
            </>
          ) : null}

          {filterMode === 'custom' ? (
            <>
              <input className="input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: '150px' }} />
              <input className="input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: '150px' }} />
            </>
          ) : null}

          <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ width: '170px' }}>
            <option value="">All Teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>

          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: '200px' }}>
            <option value="">All Users</option>
            {filteredUsers.map((user) => (
              <option key={user.id} value={user.id}>{user.displayName}</option>
            ))}
          </select>

          <select
            className="select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | DeductionCategory)}
            style={{ width: '170px' }}
          >
            <option value="ALL">All Categories</option>
            <option value="PUNCH_LATE">Punch Late</option>
            <option value="BREAK_LATE">Break Late</option>
          </select>

          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? 'Loading…' : 'Apply'}
          </button>

          <button
            type="button"
            className="button button-ghost"
            onClick={exportCsv}
            disabled={entries.length === 0}
          >
            Export CSV
          </button>
        </div>
      </form>

      <section className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Total Deduction</p>
          <p className="kpi-value">{fmtMoney(summary?.totals.totalAed || 0)}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Users Affected</p>
          <p className="kpi-value">{summary?.totals.usersAffected || 0}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Punch Late (AED)</p>
          <p className="kpi-value">{fmtMoney(summary?.totals.punchLateAed || 0)}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Break Late (AED)</p>
          <p className="kpi-value">{fmtMoney(summary?.totals.breakLateAed || 0)}</p>
        </article>
      </section>

      <article className="card table-wrap" style={{ marginTop: '0.9rem' }}>
        <div className="toolbar" style={{ marginBottom: '0.45rem' }}>
          <h3 style={{ margin: 0 }}>Per-user Summary</h3>
          <div className="toolbar-spacer" />
          <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            {summary?.rows.length || 0} users
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Team</th>
              <th>Punch Late</th>
              <th>Punch AED</th>
              <th>Break Late</th>
              <th>Break AED</th>
              <th>Total AED</th>
            </tr>
          </thead>
          <tbody>
            {summary?.rows.map((row) => (
              <tr key={row.user.id}>
                <td>
                  <div>{row.user.displayName}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>@{row.user.username}</div>
                </td>
                <td>{row.user.team?.name || 'No Team'}</td>
                <td>{row.punchLateEvents}</td>
                <td>{fmtMoney(row.punchLateAed)}</td>
                <td>{row.breakLateEvents}</td>
                <td>{fmtMoney(row.breakLateAed)}</td>
                <td><strong>{fmtMoney(row.totalAed)}</strong></td>
              </tr>
            ))}
            {!summary || summary.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty">No deduction data for this filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>

      <article className="card table-wrap" style={{ marginTop: '0.9rem' }}>
        <div className="toolbar" style={{ marginBottom: '0.45rem' }}>
          <h3 style={{ margin: 0 }}>Detailed Entries</h3>
          <div className="toolbar-spacer" />
          <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{entries.length} / {entriesTotal}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Team</th>
              <th>Category</th>
              <th>Occurrence</th>
              <th>Amount</th>
              <th>Source</th>
              <th>Late Min</th>
              <th>Break OT Min</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="mono">{entry.localDate}</td>
                <td>{entry.user.displayName}</td>
                <td>{entry.user.team?.name || 'No Team'}</td>
                <td>
                  <span className={`tag ${entry.category === 'PUNCH_LATE' ? 'danger' : 'warning'}`}>
                    {CATEGORY_LABEL[entry.category]}
                  </span>
                </td>
                <td>#{entry.occurrenceNo}</td>
                <td><strong>{fmtMoney(entry.amountAed)}</strong></td>
                <td className="mono">{entry.sourceType === 'DUTY_SESSION' ? 'Duty Session' : 'Break Session'}</td>
                <td>{entry.lateMinutesSnapshot ?? '—'}</td>
                <td>{entry.breakOvertimeMinutesSnapshot ?? '—'}</td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="table-empty">No deduction entries for this filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </AppShell>
  );
}
