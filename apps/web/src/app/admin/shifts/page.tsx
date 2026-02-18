'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type Team = {
  id: string;
  name: string;
};

type ShiftSegment = {
  id: string;
  segmentNo: number;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  lateGraceMinutes: number;
};

type ShiftPreset = {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  teamId?: string | null;
  team?: Team | null;
  segments: ShiftSegment[];
};

type ShiftAssignment = {
  id: string;
  targetType: 'TEAM' | 'USER';
  targetId: string;
  shiftPresetId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  shiftPreset: ShiftPreset;
};

type SegmentDraft = {
  id: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  lateGraceMinutes: number;
};

const DEFAULT_TIMEZONE = 'Asia/Dubai';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inferCrossesMidnight(startTime: string, endTime: string): boolean {
  return endTime <= startTime;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toISOString().slice(0, 10);
}

function createDefaultSegments(): SegmentDraft[] {
  return [
    {
      id: crypto.randomUUID(),
      startTime: '03:00',
      endTime: '12:00',
      crossesMidnight: false,
      lateGraceMinutes: 10
    },
    {
      id: crypto.randomUUID(),
      startTime: '17:00',
      endTime: '20:00',
      crossesMidnight: false,
      lateGraceMinutes: 10
    }
  ];
}

export default function AdminShiftsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [presets, setPresets] = useState<ShiftPreset[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [presetName, setPresetName] = useState('');
  const [presetTimezone, setPresetTimezone] = useState(DEFAULT_TIMEZONE);
  const [presetTeamId, setPresetTeamId] = useState('');
  const [presetIsDefault, setPresetIsDefault] = useState(false);
  const [segments, setSegments] = useState<SegmentDraft[]>(createDefaultSegments());

  const [assignmentTeamId, setAssignmentTeamId] = useState('');
  const [assignmentPresetId, setAssignmentPresetId] = useState('');
  const [assignmentFrom, setAssignmentFrom] = useState(todayStr());

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (presets.length === 0) return;
    setAssignmentPresetId((prev) => prev || presets[0].id);
  }, [presets]);

  useEffect(() => {
    if (teams.length === 0) return;
    setAssignmentTeamId((prev) => prev || teams[0].id);
  }, [teams]);

  async function load(): Promise<void> {
    setLoading(true);
    setError('');

    try {
      const [teamData, presetData, assignmentData] = await Promise.all([
        apiFetch<Team[]>('/teams'),
        apiFetch<ShiftPreset[]>('/admin/shift-presets'),
        apiFetch<ShiftAssignment[]>('/admin/shift-assignments')
      ]);
      setTeams(teamData);
      setPresets(presetData);
      setAssignments(assignmentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shift data');
    } finally {
      setLoading(false);
    }
  }

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  }

  function updateSegment(segmentId: string, key: keyof SegmentDraft, value: string | number | boolean) {
    setSegments((current) =>
      current.map((segment) => {
        if (segment.id !== segmentId) return segment;
        return { ...segment, [key]: value };
      })
    );
  }

  function addSegment() {
    setSegments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        startTime: '09:00',
        endTime: '18:00',
        crossesMidnight: false,
        lateGraceMinutes: 10
      }
    ]);
  }

  function removeSegment(segmentId: string) {
    setSegments((current) => {
      if (current.length <= 1) return current;
      return current.filter((segment) => segment.id !== segmentId);
    });
  }

  async function submitPreset(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');

    if (!presetName.trim()) {
      setError('Preset name is required');
      return;
    }

    if (segments.length === 0) {
      setError('At least one segment is required');
      return;
    }

    const payloadSegments = segments.map((segment, index) => ({
      segmentNo: index + 1,
      startTime: segment.startTime,
      endTime: segment.endTime,
      crossesMidnight: segment.crossesMidnight || inferCrossesMidnight(segment.startTime, segment.endTime),
      lateGraceMinutes: Number(segment.lateGraceMinutes)
    }));

    try {
      await apiFetch('/admin/shift-presets', {
        method: 'POST',
        body: JSON.stringify({
          name: presetName,
          timezone: presetTimezone || DEFAULT_TIMEZONE,
          teamId: presetTeamId || undefined,
          isDefault: presetIsDefault,
          segments: payloadSegments
        })
      });

      setPresetName('');
      setPresetTimezone(DEFAULT_TIMEZONE);
      setPresetTeamId('');
      setPresetIsDefault(false);
      setSegments(createDefaultSegments());
      flash('Shift preset created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create preset');
    }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');

    if (!assignmentTeamId || !assignmentPresetId || !assignmentFrom) {
      setError('Team, preset, and effective date are required');
      return;
    }

    try {
      await apiFetch('/admin/shift-assignments', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'TEAM',
          targetId: assignmentTeamId,
          shiftPresetId: assignmentPresetId,
          effectiveFrom: assignmentFrom
        })
      });

      flash('Shift assignment saved');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign preset');
    }
  }

  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);

  const latestTeamAssignments = useMemo(() => {
    const byTeam = new Map<string, ShiftAssignment>();

    const teamAssignments = assignments
      .filter((assignment) => assignment.targetType === 'TEAM' && assignment.isActive)
      .sort((a, b) => {
        const aTime = new Date(a.effectiveFrom).getTime();
        const bTime = new Date(b.effectiveFrom).getTime();
        return bTime - aTime;
      });

    for (const assignment of teamAssignments) {
      if (!byTeam.has(assignment.targetId)) {
        byTeam.set(assignment.targetId, assignment);
      }
    }

    return [...byTeam.values()].sort((a, b) => {
      const teamA = teamMap.get(a.targetId) || '';
      const teamB = teamMap.get(b.targetId) || '';
      return teamA.localeCompare(teamB);
    });
  }, [assignments, teamMap]);

  return (
    <AppShell title="Shifts" subtitle="Create split-shift presets and assign them to teams" admin userRole="ADMIN">
      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">⚠ {error}</div> : null}

      <section className="split">
        <article className="card">
          <h3>Create Shift Preset</h3>
          <form className="form-grid" onSubmit={(event) => void submitPreset(event)}>
            <input
              className="input"
              placeholder="Preset name (example: Team A Double Shift)"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input
                className="input"
                placeholder="Timezone"
                value={presetTimezone}
                onChange={(event) => setPresetTimezone(event.target.value)}
              />
              <select
                className="select"
                value={presetTeamId}
                onChange={(event) => setPresetTeamId(event.target.value)}
              >
                <option value="">Global preset</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem' }}>
              <input
                type="checkbox"
                checked={presetIsDefault}
                onChange={(event) => setPresetIsDefault(event.target.checked)}
              />
              Mark this as default preset
            </label>

            <div style={{ display: 'grid', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.82rem' }}>Segments</strong>
                <button type="button" className="button button-ghost button-sm" onClick={addSegment}>
                  + Add Segment
                </button>
              </div>

              {segments.map((segment, index) => (
                <div key={segment.id} className="card" style={{ padding: '0.55rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <span className="tag">Segment {index + 1}</span>
                    <button
                      type="button"
                      className="button button-danger button-sm"
                      onClick={() => removeSegment(segment.id)}
                      disabled={segments.length === 1}
                    >
                      Remove
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Start</label>
                      <input
                        className="input"
                        type="time"
                        value={segment.startTime}
                        onChange={(event) => updateSegment(segment.id, 'startTime', event.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>End</label>
                      <input
                        className="input"
                        type="time"
                        value={segment.endTime}
                        onChange={(event) => updateSegment(segment.id, 'endTime', event.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Late grace (minutes)</label>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={segment.lateGraceMinutes}
                        onChange={(event) => updateSegment(segment.id, 'lateGraceMinutes', Number(event.target.value))}
                      />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', marginTop: '1.2rem' }}>
                      <input
                        type="checkbox"
                        checked={segment.crossesMidnight}
                        onChange={(event) => updateSegment(segment.id, 'crossesMidnight', event.target.checked)}
                      />
                      Crosses midnight
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Create Preset'}
            </button>
          </form>
        </article>

        <article className="card">
          <h3>Assign Preset To Team</h3>
          <form className="form-grid" onSubmit={(event) => void submitAssignment(event)}>
            <select
              className="select"
              value={assignmentTeamId}
              onChange={(event) => setAssignmentTeamId(event.target.value)}
            >
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>

            <select
              className="select"
              value={assignmentPresetId}
              onChange={(event) => setAssignmentPresetId(event.target.value)}
            >
              <option value="">Select preset</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>

            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Effective from</label>
              <input
                className="input"
                type="date"
                value={assignmentFrom}
                onChange={(event) => setAssignmentFrom(event.target.value)}
              />
            </div>

            <button type="submit" className="button button-primary" disabled={loading}>
              Save Assignment
            </button>
          </form>

          <div style={{ marginTop: '0.85rem' }}>
            <h3 style={{ marginBottom: '0.35rem' }}>Current Team Assignments</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Preset</th>
                    <th>Effective From</th>
                    <th>Effective To</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTeamAssignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>{teamMap.get(assignment.targetId) || assignment.targetId}</td>
                      <td>{assignment.shiftPreset.name}</td>
                      <td className="mono">{formatDate(assignment.effectiveFrom)}</td>
                      <td className="mono">{assignment.effectiveTo ? formatDate(assignment.effectiveTo) : 'Open'}</td>
                    </tr>
                  ))}
                  {latestTeamAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--muted)' }}>No team assignments yet</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </section>

      <article className="card">
        <h3>Preset Library</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Timezone</th>
                <th>Default</th>
                <th>Segments</th>
              </tr>
            </thead>
            <tbody>
              {presets.map((preset) => (
                <tr key={preset.id}>
                  <td>{preset.name}</td>
                  <td>{preset.team?.name || 'Global'}</td>
                  <td className="mono">{preset.timezone}</td>
                  <td>{preset.isDefault ? <span className="tag ok">Yes</span> : 'No'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {preset.segments
                        .slice()
                        .sort((a, b) => a.segmentNo - b.segmentNo)
                        .map((segment) => (
                          <span key={segment.id} className="tag brand">
                            #{segment.segmentNo} {segment.startTime}-{segment.endTime}
                          </span>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
              {presets.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)' }}>No shift presets yet</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </AppShell>
  );
}
