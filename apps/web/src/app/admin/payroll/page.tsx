'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

type Team = { id: string; name: string };
type SalaryRule = {
  id: string;
  name: string;
  baseHourlyRate: string;
  overtimeMultiplier: string;
  latePenaltyPerMinute: string;
  breakDeductionMode: string;
};

type PayrollRun = {
  id: string;
  localDateFrom: string;
  localDateTo: string;
  status: 'DRAFT' | 'FINALIZED';
  createdAt: string;
  team?: Team | null;
  salaryRule: SalaryRule;
  _count: { items: number };
};

type PayrollItem = {
  id: string;
  user: { displayName: string };
  workedMinutes: number;
  breakMinutes: number;
  payableMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  grossPay: string;
  latePenalty: string;
  finalPay: string;
};

export default function AdminPayrollPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [rules, setRules] = useState<SalaryRule[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [ruleName, setRuleName] = useState('Default Rule');
  const [baseHourlyRate, setBaseHourlyRate] = useState('5');
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5');
  const [latePenaltyPerMinute, setLatePenaltyPerMinute] = useState('0');
  const [breakDeductionMode, setBreakDeductionMode] = useState('NONE');
  const [ruleEffectiveFrom, setRuleEffectiveFrom] = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [teamId, setTeamId] = useState('');
  const [salaryRuleId, setSalaryRuleId] = useState('');
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    try {
      const [teamsData, rulesData, runsData] = await Promise.all([
        apiFetch<Team[]>('/teams'),
        apiFetch<SalaryRule[]>('/admin/payroll/salary-rules'),
        apiFetch<PayrollRun[]>('/admin/payroll/runs')
      ]);
      setTeams(teamsData);
      setRules(rulesData);
      setRuns(runsData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payroll data');
    }
  }

  async function createRule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      await apiFetch('/admin/payroll/salary-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: ruleName,
          baseHourlyRate: Number(baseHourlyRate),
          overtimeMultiplier: Number(overtimeMultiplier),
          latePenaltyPerMinute: Number(latePenaltyPerMinute),
          breakDeductionMode,
          effectiveFrom: ruleEffectiveFrom
        })
      });
      setMessage('Salary rule created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create salary rule');
    }
  }

  async function generateRun(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await apiFetch('/admin/payroll/runs/generate', {
        method: 'POST',
        body: JSON.stringify({
          localDateFrom: from,
          localDateTo: to,
          teamId: teamId || undefined,
          salaryRuleId: salaryRuleId || undefined
        })
      });
      setMessage('Payroll run generated');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate payroll run');
    }
  }

  async function finalizeRun(runId: string): Promise<void> {
    try {
      await apiFetch(`/admin/payroll/runs/${runId}/finalize`, {
        method: 'POST'
      });
      setMessage('Payroll run finalized');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize payroll run');
    }
  }

  async function loadItems(runId: string): Promise<void> {
    try {
      const runItems = await apiFetch<PayrollItem[]>(`/admin/payroll/runs/${runId}/items`);
      setSelectedRunId(runId);
      setItems(runItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payroll items');
    }
  }

  async function exportCsv(runId: string): Promise<void> {
    try {
      const token = getAccessToken();
      const response = await fetch(`${apiBase}/admin/payroll/runs/${runId}/export.csv`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payroll-${runId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export CSV');
    }
  }

  return (
    <AppShell title="Payroll" subtitle="Manage salary rules and process runs" admin userRole="ADMIN">
      {message ? <p style={{ color: 'var(--ok)' }}>{message}</p> : null}
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <section className="split">
        <form className="card form-grid" onSubmit={(event) => void createRule(event)}>
          <h3>Create Salary Rule</h3>
          <input className="input" value={ruleName} onChange={(e) => setRuleName(e.target.value)} required />
          <input
            className="input"
            value={baseHourlyRate}
            onChange={(e) => setBaseHourlyRate(e.target.value)}
            type="number"
            min="0"
            step="0.01"
            required
          />
          <input
            className="input"
            value={overtimeMultiplier}
            onChange={(e) => setOvertimeMultiplier(e.target.value)}
            type="number"
            min="1"
            step="0.01"
            required
          />
          <input
            className="input"
            value={latePenaltyPerMinute}
            onChange={(e) => setLatePenaltyPerMinute(e.target.value)}
            type="number"
            min="0"
            step="0.0001"
            required
          />
          <select className="select" value={breakDeductionMode} onChange={(e) => setBreakDeductionMode(e.target.value)}>
            <option value="NONE">NONE</option>
            <option value="UNPAID_ALL_BREAKS">UNPAID_ALL_BREAKS</option>
            <option value="UNPAID_OVERTIME_ONLY">UNPAID_OVERTIME_ONLY</option>
          </select>
          <input
            className="input"
            type="date"
            value={ruleEffectiveFrom}
            onChange={(e) => setRuleEffectiveFrom(e.target.value)}
            required
          />
          <button type="submit" className="button button-primary">
            Save Rule
          </button>
        </form>

        <form className="card form-grid" onSubmit={(event) => void generateRun(event)}>
          <h3>Generate Payroll Run</h3>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <select className="select" value={salaryRuleId} onChange={(e) => setSalaryRuleId(e.target.value)}>
            <option value="">Auto active rule</option>
            {rules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.name}
              </option>
            ))}
          </select>
          <button type="submit" className="button button-primary">
            Generate Run
          </button>
        </form>
      </section>

      <section className="card table-wrap">
        <h3>Payroll Runs</h3>
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Team</th>
              <th>Rule</th>
              <th>Items</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="mono">
                  {run.localDateFrom} → {run.localDateTo}
                </td>
                <td>{run.team?.name || 'All'}</td>
                <td>{run.salaryRule.name}</td>
                <td>{run._count.items}</td>
                <td>
                  <span className={`tag ${run.status === 'FINALIZED' ? 'ok' : ''}`}>{run.status}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="button button-ghost" onClick={() => void loadItems(run.id)}>
                      View Items
                    </button>
                    <button type="button" className="button button-ghost" onClick={() => void exportCsv(run.id)}>
                      Export CSV
                    </button>
                    {run.status === 'DRAFT' ? (
                      <button type="button" className="button button-primary" onClick={() => void finalizeRun(run.id)}>
                        Finalize
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selectedRunId ? (
        <section className="card table-wrap">
          <h3>Payroll Items ({selectedRunId})</h3>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Worked</th>
                <th>Break</th>
                <th>Payable</th>
                <th>Late</th>
                <th>Gross</th>
                <th>Penalty</th>
                <th>Final</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.user.displayName}</td>
                  <td>{item.workedMinutes}m</td>
                  <td>{item.breakMinutes}m</td>
                  <td>{item.payableMinutes}m</td>
                  <td>{item.lateMinutes}m</td>
                  <td>{item.grossPay}</td>
                  <td>{item.latePenalty}</td>
                  <td>{item.finalPay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </AppShell>
  );
}
