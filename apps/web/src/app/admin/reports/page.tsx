'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type Team = { id: string; name: string };

type MonthlyReport = {
  id: string;
  scopeKey: string;
  year: number;
  month: number;
  generatedAt: string;
  team?: Team | null;
  reportJson: {
    employeesCount: number;
    dutySessionsCount: number;
    breakSessionsCount: number;
    totals: {
      workedMinutes: number;
      breakMinutes: number;
      lateMinutes: number;
    };
  };
};

export default function AdminReportsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [teamId, setTeamId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    try {
      const [teamData, reportData] = await Promise.all([
        apiFetch<Team[]>('/teams'),
        apiFetch<MonthlyReport[]>('/admin/reports/monthly')
      ]);
      setTeams(teamData);
      setReports(reportData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      await apiFetch('/admin/reports/monthly/generate', {
        method: 'POST',
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          teamId: teamId || undefined
        })
      });
      setMessage('Monthly report generated');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate monthly report');
    }
  }

  return (
    <AppShell title="Admin Reports" subtitle="Generate and review monthly snapshots" admin>
      {message ? <p style={{ color: 'var(--ok)' }}>{message}</p> : null}
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <form className="card form-grid" onSubmit={(event) => void generate(event)}>
        <h3>Generate Monthly Report</h3>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 2fr auto' }}>
          <input className="input" type="number" min="2000" value={year} onChange={(e) => setYear(e.target.value)} required />
          <input className="input" type="number" min="1" max="12" value={month} onChange={(e) => setMonth(e.target.value)} required />
          <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button type="submit" className="button button-primary">
            Generate
          </button>
        </div>
      </form>

      <section className="card table-wrap">
        <h3>Monthly Reports</h3>
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Scope</th>
              <th>Employees</th>
              <th>Duty Sessions</th>
              <th>Break Sessions</th>
              <th>Worked</th>
              <th>Break</th>
              <th>Late</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td className="mono">
                  {report.year}-{String(report.month).padStart(2, '0')}
                </td>
                <td>{report.team?.name || 'Global'}</td>
                <td>{report.reportJson.employeesCount}</td>
                <td>{report.reportJson.dutySessionsCount}</td>
                <td>{report.reportJson.breakSessionsCount}</td>
                <td>{report.reportJson.totals.workedMinutes}m</td>
                <td>{report.reportJson.totals.breakMinutes}m</td>
                <td>{report.reportJson.totals.lateMinutes}m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
