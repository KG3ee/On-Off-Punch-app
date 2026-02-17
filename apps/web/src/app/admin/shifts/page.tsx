'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type Team = { id: string; name: string };
type User = { id: string; displayName: string; role: 'ADMIN' | 'EMPLOYEE' };
type ShiftPreset = {
  id: string;
  name: string;
  teamId?: string | null;
  timezone: string;
  isDefault: boolean;
  segments: {
    id: string;
    segmentNo: number;
    startTime: string;
    endTime: string;
    crossesMidnight: boolean;
    lateGraceMinutes: number;
  }[];
};

const defaultSegments = JSON.stringify(
  [
    { segmentNo: 1, startTime: '03:00', endTime: '12:00', crossesMidnight: false, lateGraceMinutes: 10 },
    { segmentNo: 2, startTime: '17:00', endTime: '20:00', crossesMidnight: false, lateGraceMinutes: 10 }
  ],
  null,
  2
);

export default function AdminShiftsPage() {
  const [presets, setPresets] = useState<ShiftPreset[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [presetName, setPresetName] = useState('');
  const [presetTeamId, setPresetTeamId] = useState('');
  const [timezone, setTimezone] = useState('Asia/Dubai');
  const [isDefault, setIsDefault] = useState(false);
  const [segmentsText, setSegmentsText] = useState(defaultSegments);

  const [assignmentTargetType, setAssignmentTargetType] = useState<'TEAM' | 'USER'>('TEAM');
  const [assignmentTargetId, setAssignmentTargetId] = useState('');
  const [assignmentPresetId, setAssignmentPresetId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');

  const [overrideTargetType, setOverrideTargetType] = useState<'TEAM' | 'USER'>('TEAM');
  const [overrideTargetId, setOverrideTargetId] = useState('');
  const [overridePresetId, setOverridePresetId] = useState('');
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    try {
      const [presetData, teamData, userData] = await Promise.all([
        apiFetch<ShiftPreset[]>('/admin/shift-presets'),
        apiFetch<Team[]>('/teams'),
        apiFetch<User[]>('/admin/users')
      ]);
      setPresets(presetData);
      setTeams(teamData);
      setUsers(userData.filter((u) => u.role === 'EMPLOYEE'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shifts');
    }
  }

  async function submitPreset(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      const segments = JSON.parse(segmentsText) as ShiftPreset['segments'];
      await apiFetch('/admin/shift-presets', {
        method: 'POST',
        body: JSON.stringify({
          name: presetName,
          teamId: presetTeamId || undefined,
          timezone,
          isDefault,
          segments
        })
      });
      setPresetName('');
      setPresetTeamId('');
      setIsDefault(false);
      setMessage('Shift preset created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create preset');
    }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await apiFetch('/admin/shift-assignments', {
        method: 'POST',
        body: JSON.stringify({
          targetType: assignmentTargetType,
          targetId: assignmentTargetId,
          shiftPresetId: assignmentPresetId,
          effectiveFrom,
          effectiveTo: effectiveTo || undefined
        })
      });
      setMessage('Shift assignment created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment');
    }
  }

  async function submitOverride(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await apiFetch('/admin/shift-overrides', {
        method: 'POST',
        body: JSON.stringify({
          targetType: overrideTargetType,
          targetId: overrideTargetId,
          shiftPresetId: overridePresetId,
          overrideDate,
          reason: overrideReason || undefined
        })
      });
      setMessage('Shift override created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create override');
    }
  }

  const targetOptions =
    assignmentTargetType === 'TEAM'
      ? teams.map((team) => ({ id: team.id, label: team.name }))
      : users.map((user) => ({ id: user.id, label: user.displayName }));

  const overrideTargetOptions =
    overrideTargetType === 'TEAM'
      ? teams.map((team) => ({ id: team.id, label: team.name }))
      : users.map((user) => ({ id: user.id, label: user.displayName }));

  return (
    <AppShell title="Admin Shifts" subtitle="Manage shift presets and team assignments" admin userRole="ADMIN">
      {message ? <p style={{ color: 'var(--ok)' }}>{message}</p> : null}
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <form className="card form-grid" onSubmit={(event) => void submitPreset(event)}>
          <h3>Create Shift Preset</h3>
          <input
            className="input"
            placeholder="Preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            required
          />
          <select className="select" value={presetTeamId} onChange={(e) => setPresetTeamId(e.target.value)}>
            <option value="">Global preset</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Default preset
          </label>
          <textarea
            className="input mono"
            rows={8}
            value={segmentsText}
            onChange={(e) => setSegmentsText(e.target.value)}
          />
          <button type="submit" className="button button-primary">
            Save Preset
          </button>
        </form>

        <form className="card form-grid" onSubmit={(event) => void submitAssignment(event)}>
          <h3>Create Assignment</h3>
          <select
            className="select"
            value={assignmentTargetType}
            onChange={(e) => setAssignmentTargetType(e.target.value as 'TEAM' | 'USER')}
          >
            <option value="TEAM">TEAM</option>
            <option value="USER">USER</option>
          </select>
          <select className="select" value={assignmentTargetId} onChange={(e) => setAssignmentTargetId(e.target.value)} required>
            <option value="">Select target</option>
            {targetOptions.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
          <select className="select" value={assignmentPresetId} onChange={(e) => setAssignmentPresetId(e.target.value)} required>
            <option value="">Select preset</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <input className="input" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
          <input className="input" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          <button type="submit" className="button button-primary">
            Save Assignment
          </button>
        </form>

        <form className="card form-grid" onSubmit={(event) => void submitOverride(event)}>
          <h3>Create Date Override</h3>
          <select
            className="select"
            value={overrideTargetType}
            onChange={(e) => setOverrideTargetType(e.target.value as 'TEAM' | 'USER')}
          >
            <option value="TEAM">TEAM</option>
            <option value="USER">USER</option>
          </select>
          <select className="select" value={overrideTargetId} onChange={(e) => setOverrideTargetId(e.target.value)} required>
            <option value="">Select target</option>
            {overrideTargetOptions.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
          <select className="select" value={overridePresetId} onChange={(e) => setOverridePresetId(e.target.value)} required>
            <option value="">Select preset</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <input className="input" type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} required />
          <input
            className="input"
            placeholder="Reason"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
          />
          <button type="submit" className="button button-primary">
            Save Override
          </button>
        </form>
      </section>

      <section className="card table-wrap">
        <h3>Shift Presets</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Team</th>
              <th>Default</th>
              <th>Segments</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((preset) => (
              <tr key={preset.id}>
                <td>{preset.name}</td>
                <td>{teams.find((team) => team.id === preset.teamId)?.name || 'Global'}</td>
                <td>{preset.isDefault ? 'Yes' : 'No'}</td>
                <td>
                  {preset.segments
                    .map((segment) => `#${segment.segmentNo} ${segment.startTime}-${segment.endTime}`)
                    .join(' | ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
