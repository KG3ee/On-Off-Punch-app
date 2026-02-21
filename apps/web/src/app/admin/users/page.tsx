'use client';

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type Team = { id: string; name: string; shiftStartTime?: string | null; shiftEndTime?: string | null };

type ShiftPresetSegment = {
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
  teamId?: string | null;
  segments: ShiftPresetSegment[];
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

type ShiftInputRow = {
  id: string;
  startTime: string;
  endTime: string;
};

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName?: string;
  role: 'ADMIN' | 'MEMBER' | 'DRIVER' | 'LEADER' | 'MAID' | 'CHEF';
  team?: Team | null;
  isActive: boolean;
  mustChangePassword: boolean;
};

type RegistrationRequestStatus = 'PENDING' | 'READY_REVIEW' | 'APPROVED' | 'REJECTED';

type RegistrationRequestRow = {
  id: string;
  staffCode: string;

  firstName: string;
  lastName?: string | null;
  displayName: string;
  desiredUsername: string;
  status: RegistrationRequestStatus;
  verificationScore: number;
  verificationNotes?: string | null;
  submittedAt: string;
  requestedTeam?: { id: string; name: string } | null;
  rosterEntry?: { id: string; staffCode: string; displayName: string; defaultTeam?: { id: string; name: string } | null } | null;
  reviewedBy?: { id: string; displayName: string; username: string } | null;
  reviewNote?: string | null;
};

type RegistrationRosterRow = {
  id: string;
  staffCode: string;
  defaultTeamId?: string | null;
  defaultTeam?: { id: string; name: string } | null;
  defaultRole: 'ADMIN' | 'MEMBER' | 'DRIVER' | 'LEADER' | 'MAID' | 'CHEF';
  isActive: boolean;
};

function createRowId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function inferCrossesMidnight(startTime: string, endTime: string): boolean {
  return endTime <= startTime;
}

export default function AdminUsersPage() {
  return <Suspense><AdminUsersContent /></Suspense>;
}

function AdminUsersContent() {
  const searchParams = useSearchParams();
  const registrationRef = useRef<HTMLElement>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<ShiftAssignment[]>([]);
  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequestRow[]>([]);
  const [registrationRoster, setRegistrationRoster] = useState<RegistrationRosterRow[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modal
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editTeamName, setEditTeamName] = useState('');

  // Create user form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [role, setRole] = useState<'ADMIN' | 'MEMBER' | 'DRIVER' | 'LEADER' | 'MAID' | 'CHEF'>('MEMBER');
  const [teamId, setTeamId] = useState('');

  // Create team form
  const [teamName, setTeamName] = useState('');
  const [teamShiftStart, setTeamShiftStart] = useState('');
  const [teamShiftEnd, setTeamShiftEnd] = useState('');
  const [editShiftRows, setEditShiftRows] = useState<ShiftInputRow[]>([{ id: createRowId(), startTime: '', endTime: '' }]);
  const [editEffectiveFrom, setEditEffectiveFrom] = useState(todayStr());

  // Action menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset password modal
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Edit user modal
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<'ADMIN' | 'MEMBER' | 'DRIVER' | 'LEADER' | 'MAID' | 'CHEF'>('MEMBER');
  const [editTeamId, setEditTeamId] = useState('');

  // Registration roster form
  const [rosterStaffCode, setRosterStaffCode] = useState('');
  const [rosterTeamId, setRosterTeamId] = useState('');
  const [rosterRole, setRosterRole] = useState<'ADMIN' | 'MEMBER' | 'DRIVER' | 'LEADER' | 'MAID' | 'CHEF'>('MEMBER');

  const load = useCallback(async (silent = false): Promise<void> => {
    try {
      const [userData, teamData, assignmentData, requestData, rosterData] = await Promise.all([
        apiFetch<UserRow[]>('/admin/users'),
        apiFetch<Team[]>('/teams'),
        apiFetch<ShiftAssignment[]>('/admin/shift-assignments'),
        apiFetch<RegistrationRequestRow[]>('/admin/registration-requests'),
        apiFetch<RegistrationRosterRow[]>('/admin/registration-roster')
      ]);
      setUsers(userData);
      setTeams(teamData);
      setShiftAssignments(assignmentData);
      setRegistrationRequests(requestData);
      setRegistrationRoster(rosterData);
      setError('');
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  }, []);

  useEffect(() => {
    void load().then(() => {
      if (searchParams.get('section') === 'registrations') {
        setTimeout(() => registrationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    });
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => clearInterval(timer);
  }, [load, searchParams]);

  // Close action menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  }

  function getCurrentTeamAssignment(teamId: string): ShiftAssignment | null {
    const today = todayStr();

    const candidates = shiftAssignments
      .filter((assignment) => assignment.targetType === 'TEAM' && assignment.targetId === teamId && assignment.isActive)
      .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

    const activeToday = candidates.find((assignment) => {
      const from = assignment.effectiveFrom.slice(0, 10);
      const to = assignment.effectiveTo ? assignment.effectiveTo.slice(0, 10) : null;
      return from <= today && (!to || to >= today);
    });

    return activeToday || candidates[0] || null;
  }

  function getTeamShiftRows(team: Team): ShiftInputRow[] {
    const currentAssignment = getCurrentTeamAssignment(team.id);
    if (currentAssignment?.shiftPreset?.segments?.length) {
      return [...currentAssignment.shiftPreset.segments]
        .sort((a, b) => a.segmentNo - b.segmentNo)
        .map((segment) => ({
          id: createRowId(),
          startTime: segment.startTime,
          endTime: segment.endTime
        }));
    }

    if (team.shiftStartTime && team.shiftEndTime) {
      return [{ id: createRowId(), startTime: team.shiftStartTime, endTime: team.shiftEndTime }];
    }

    return [{ id: createRowId(), startTime: '', endTime: '' }];
  }

  function openEditTeam(team: Team) {
    setEditingTeam(team);
    setEditTeamName(team.name);
    setEditShiftRows(getTeamShiftRows(team));
    setEditEffectiveFrom(todayStr());
  }

  // ── Team CRUD ──
  async function createTeam(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    try {
      await apiFetch('/teams/admin', {
        method: 'POST',
        body: JSON.stringify({
          name: teamName,
          shiftStartTime: teamShiftStart || undefined,
          shiftEndTime: teamShiftEnd || undefined,
        })
      });
      setTeamName(''); setTeamShiftStart(''); setTeamShiftEnd('');
      setShowCreateTeam(false);
      flash('Team created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    }
  }

  async function renameTeam(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!editingTeam) return;

    const normalizedRows = editShiftRows
      .map((row) => ({
        startTime: row.startTime.trim(),
        endTime: row.endTime.trim()
      }))
      .filter((row) => row.startTime && row.endTime);

    if (normalizedRows.length === 0) {
      setError('Please configure at least one shift segment');
      return;
    }

    try {
      await apiFetch(`/teams/admin/${editingTeam.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editTeamName,
          shiftStartTime: normalizedRows[0].startTime,
          shiftEndTime: normalizedRows[0].endTime,
        })
      });

      const presetName = `${editTeamName} Multi Shift ${new Date().toISOString().slice(0, 10)}`;
      const createdPreset = await apiFetch<ShiftPreset>('/admin/shift-presets', {
        method: 'POST',
        body: JSON.stringify({
          name: presetName,
          teamId: editingTeam.id,
          timezone: 'Asia/Dubai',
          segments: normalizedRows.map((row, index) => ({
            segmentNo: index + 1,
            startTime: row.startTime,
            endTime: row.endTime,
            crossesMidnight: inferCrossesMidnight(row.startTime, row.endTime),
            lateGraceMinutes: 10
          }))
        })
      });

      await apiFetch('/admin/shift-assignments', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'TEAM',
          targetId: editingTeam.id,
          shiftPresetId: createdPreset.id,
          effectiveFrom: editEffectiveFrom || todayStr()
        })
      });

      setEditingTeam(null);
      flash('Team updated');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update team');
    }
  }

  async function deleteTeam(id: string): Promise<void> {
    if (!confirm('Delete this team? Users in it will become unassigned.')) return;
    try {
      await apiFetch(`/teams/admin/${id}`, { method: 'DELETE' });
      flash('Team deleted');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  }

  // ── User CRUD ──
  async function createUser(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          firstName, lastName, displayName, username, password,
          role, teamId: teamId || undefined, mustChangePassword
        })
      });
      setFirstName(''); setLastName(''); setDisplayName('');
      setUsername(''); setPassword(''); setRole('MEMBER');
      setTeamId(''); setMustChangePassword(true);
      setShowCreateUser(false);
      flash('User created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  }

  async function updateUserField(userId: string, data: Record<string, unknown>): Promise<void> {
    try {
      await apiFetch(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) });
      flash('User updated');
      setOpenMenuId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function submitResetPassword(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!resetPasswordUser) return;
    try {
      await apiFetch(`/admin/users/${resetPasswordUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword, mustChangePassword: true })
      });
      setResetPasswordUser(null);
      setNewPassword('');
      flash('Password reset — user will be prompted to change it');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  }

  async function submitEditUser(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await apiFetch(`/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: editRole, teamId: editTeamId || null })
      });
      setEditingUser(null);
      flash('User updated');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  }

  async function deleteUser(id: string, displayName: string): Promise<void> {
    const confirmation = prompt(`WARNING: This will permanently delete user "${displayName}" and ALL their history (attendance, breaks, reports).\n\nType "DELETE" to confirm:`);
    if (confirmation !== 'DELETE') return;

    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
      flash('User deleted permanently');
      setOpenMenuId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }

  function openEditUser(user: UserRow) {
    setEditingUser(user);
    setEditRole(user.role);
    setEditTeamId(user.team?.id || '');
    setOpenMenuId(null);
  }

  function openResetPassword(user: UserRow) {
    setResetPasswordUser(user);
    setNewPassword('');
    setOpenMenuId(null);
  }

  function updateShiftRow(rowId: string, key: 'startTime' | 'endTime', value: string) {
    setEditShiftRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    );
  }

  function addShiftRow() {
    setEditShiftRows((rows) => [...rows, { id: createRowId(), startTime: '', endTime: '' }]);
  }

  function removeShiftRow(rowId: string) {
    setEditShiftRows((rows) => (rows.length > 1 ? rows.filter((row) => row.id !== rowId) : rows));
  }

  function getTeamShiftText(team: Team): string {
    const assignment = getCurrentTeamAssignment(team.id);
    if (assignment?.shiftPreset?.segments?.length) {
      return [...assignment.shiftPreset.segments]
        .sort((a, b) => a.segmentNo - b.segmentNo)
        .map((segment) => `${segment.startTime}-${segment.endTime}`)
        .join(' | ');
    }
    if (team.shiftStartTime && team.shiftEndTime) {
      return `${team.shiftStartTime}-${team.shiftEndTime}`;
    }
    return '—';
  }

  function formatDateTime(value: string): string {
    return new Date(value).toLocaleString();
  }

  async function createRosterEntry(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    try {
      await apiFetch('/admin/registration-roster', {
        method: 'POST',
        body: JSON.stringify({
          staffCode: rosterStaffCode,
          defaultTeamId: rosterTeamId || undefined,
          defaultRole: rosterRole
        })
      });

      setRosterStaffCode('');
      setRosterTeamId('');
      setRosterRole('MEMBER');
      flash('Roster entry saved');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save roster entry');
    }
  }

  async function deleteRosterEntry(id: string): Promise<void> {
    if (!confirm('Delete this roster entry?')) return;
    try {
      await apiFetch(`/admin/registration-roster/${id}`, { method: 'DELETE' });
      flash('Roster entry deleted');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete roster entry');
    }
  }

  async function approveRequest(requestId: string): Promise<void> {
    try {
      await apiFetch(`/admin/registration-requests/${requestId}/approve`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      flash('Registration request approved');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    }
  }

  async function rejectRequest(requestId: string): Promise<void> {
    const note = prompt('Optional reject reason:') || undefined;
    try {
      await apiFetch(`/admin/registration-requests/${requestId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reviewNote: note })
      });
      flash('Registration request rejected');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    }
  }

  // ── Filter ──
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
      || (u.team?.name || '').toLowerCase().includes(q);
  });

  const pendingRegistrationRequests = registrationRequests.filter((request) =>
    request.status === 'PENDING' || request.status === 'READY_REVIEW'
  );

  return (
    <AppShell title="Users & Teams" subtitle="Manage employees, roles, and teams" admin userRole="ADMIN">
      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">⚠ {error}</div> : null}

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="input-search">
          <input
            className="input"
            placeholder="Search name, username, or team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="toolbar-spacer" />
        <button type="button" className="button button-ghost" onClick={() => setShowCreateTeam(true)}>
          + Team
        </button>
        <button type="button" className="button button-primary" onClick={() => setShowCreateUser(true)}>
          + New User
        </button>
      </div>

      <article className="card" ref={registrationRef}>
        <h3>Registration Approval Queue</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Staff Code</th>
                <th>Name</th>
                <th>Username</th>
                <th>Verification</th>
                <th>Status</th>
                <th style={{ width: '140px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingRegistrationRequests.map((request) => (
                <tr key={request.id}>
                  <td className="mono">{formatDateTime(request.submittedAt)}</td>
                  <td className="mono">{request.staffCode}</td>
                  <td>
                    <div>{request.displayName}</div>

                  </td>
                  <td className="mono">{request.desiredUsername}</td>
                  <td>
                    <span className={`tag ${request.verificationScore >= 90 ? 'ok' : request.verificationScore >= 40 ? 'warning' : 'danger'}`}>
                      {request.verificationScore}
                    </span>
                    {request.verificationNotes ? (
                      <div style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                        {request.verificationNotes}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`tag ${request.status === 'READY_REVIEW' ? 'ok' : 'warning'}`}>
                      {request.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button type="button" className="button button-ok button-sm" onClick={() => void approveRequest(request.id)}>
                        Approve
                      </button>
                      <button type="button" className="button button-danger button-sm" onClick={() => void rejectRequest(request.id)}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pendingRegistrationRequests.length === 0 ? (
                <tr><td colSpan={7} style={{ color: 'var(--muted)', textAlign: 'center', padding: '1.5rem' }}>No pending registration requests</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h3>Registration Roster</h3>
        <form className="toolbar" onSubmit={(e) => void createRosterEntry(e)}>
          <input
            className="input"
            style={{ width: '140px' }}
            value={rosterStaffCode}
            onChange={(e) => setRosterStaffCode(e.target.value.toUpperCase())}
            placeholder="Staff code"
            required
          />
          <select className="select" style={{ width: '170px' }} value={rosterTeamId} onChange={(e) => setRosterTeamId(e.target.value)}>
            <option value="">Service (no team)</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
          <select className="select" style={{ width: '130px' }} value={rosterRole} onChange={(e) => setRosterRole(e.target.value as any)}>
            <option value="MEMBER">MEMBER</option>
            <option value="LEADER">LEADER</option>
            <option value="DRIVER">DRIVER</option>
            <option value="MAID">MAID</option>
            <option value="CHEF">CHEF</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button type="submit" className="button button-primary">Save Roster</button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff Code</th>
                <th>Default Group</th>
                <th>Default Role</th>
                <th style={{ width: '90px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {registrationRoster.map((entry) => (
                <tr key={entry.id}>
                  <td className="mono">{entry.staffCode}</td>
                  <td>{entry.defaultTeam ? <span className="tag brand">{entry.defaultTeam.name}</span> : <span className="tag">Service</span>}</td>
                  <td>
                    <span className={`tag role-${entry.defaultRole.toLowerCase()}`}>{entry.defaultRole}</span>
                  </td>
                  <td>
                    <button type="button" className="button button-danger button-sm" onClick={() => void deleteRosterEntry(entry.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {registrationRoster.length === 0 ? (
                <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center', padding: '1.5rem' }}>No roster entries yet</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>


      {/* ── Teams Table ── */}
      <article className="card">
        <h3>Teams</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Shifts</th>
                <th>Members</th>
                <th style={{ width: '100px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(team => {
                const memberCount = users.filter(u => u.team?.id === team.id).length;
                return (
                  <tr key={team.id}>
                    <td style={{ fontWeight: 500 }}>{team.name}</td>
                    <td className="mono">{getTeamShiftText(team)}</td>
                    <td>{memberCount}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button
                          type="button"
                          className="button button-ghost button-sm"
                          onClick={() => openEditTeam(team)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="button button-danger button-sm"
                          onClick={() => void deleteTeam(team.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {teams.length === 0 ? (
                <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center', padding: '1.5rem' }}>No teams yet &mdash; click &ldquo;+ Team&rdquo; to create one</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
      {/* ── Users Table ── */}
      <article className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Group</th>
              <th>Role</th>
              <th>Status</th>
              <th>PW Change</th>
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user, index) => (
              <tr key={user.id}>
                <td style={{ fontWeight: 500 }}>{user.displayName}</td>
                <td className="mono">{user.username}</td>
                <td>{user.team ? <span className="tag brand">{user.team.name}</span> : <span className="tag">Service</span>}</td>
                <td>
                  <span className={`tag role-${user.role.toLowerCase()}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <span className={`tag ${user.isActive ? 'ok' : 'danger'}`}>
                    {user.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </td>
                <td>{user.mustChangePassword ? <span className="tag warning">Required</span> : '—'}</td>
                <td>
                  <div className="action-menu-wrap" ref={openMenuId === user.id ? menuRef : undefined}>
                    <button
                      className="action-menu-btn"
                      onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                      title="Actions"
                    >
                      ⋮
                    </button>
                    {openMenuId === user.id ? (
                      <div
                        className="action-menu"
                        style={index >= filteredUsers.length - 2 ? { top: 'auto', bottom: '100%', marginBottom: '4px' } : undefined}
                      >
                        <button onClick={() => openEditUser(user)}>✏️ Edit Role &amp; Team</button>
                        <button onClick={() => openResetPassword(user)}>🔑 Reset Password</button>
                        <button
                          onClick={() => void updateUserField(user.id, { isActive: !user.isActive })}
                        >
                          {user.isActive ? '🚫 Deactivate' : '✅ Reactivate'}
                        </button>
                        <hr style={{ margin: '0.2rem 0', border: 0, borderTop: '1px solid var(--border)' }} />
                        <button
                          onClick={() => void deleteUser(user.id, user.displayName)}
                          style={{ color: 'var(--danger)' }}
                        >
                          🗑 Delete Permanently
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 ? (
              <tr><td colSpan={7} style={{ color: 'var(--muted)', textAlign: 'center', padding: '1.5rem' }}>
                {search ? 'No users matching search' : 'No users found'}
              </td></tr>
            ) : null}
          </tbody>
        </table>
      </article>

      {/* ══════════════════════════════════════ */}
      {/* ── MODALS ── */}
      {/* ══════════════════════════════════════ */}

      {/* Create User Modal */}
      {showCreateUser ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateUser(false); }}>
          <div className="modal">
            <h3>👤 Create New User</h3>
            <form className="form-grid" onSubmit={(e) => void createUser(e)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required />
                <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
              </div>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" required />
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required />
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" minLength={6} required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <select className="select" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER' | 'DRIVER' | 'LEADER' | 'MAID' | 'CHEF')}>
                  <option value="MEMBER">MEMBER</option>
                  <option value="LEADER">LEADER</option>
                  <option value="DRIVER">DRIVER</option>
                  <option value="MAID">MAID</option>
                  <option value="CHEF">CHEF</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">Service (no team)</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.78rem' }}>
                <input type="checkbox" checked={mustChangePassword} onChange={(e) => setMustChangePassword(e.target.checked)} />
                Force password change on first login
              </label>
              <div className="modal-footer">
                <button type="button" className="button button-ghost" onClick={() => setShowCreateUser(false)}>Cancel</button>
                <button type="submit" className="button button-primary">Create User</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Create Team Modal */}
      {showCreateTeam ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateTeam(false); }}>
          <div className="modal">
            <h3>🏷️ Create New Team</h3>
            <form className="form-grid" onSubmit={(e) => void createTeam(e)}>
              <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" required autoFocus />
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Shift Schedule (optional)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Start Time</label>
                  <input className="input" type="time" value={teamShiftStart} onChange={(e) => setTeamShiftStart(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>End Time</label>
                  <input className="input" type="time" value={teamShiftEnd} onChange={(e) => setTeamShiftEnd(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="button button-ghost" onClick={() => setShowCreateTeam(false)}>Cancel</button>
                <button type="submit" className="button button-primary">Create Team</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Reset Password Modal */}
      {resetPasswordUser ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setResetPasswordUser(null); }}>
          <div className="modal">
            <h3>🔑 Reset Password</h3>
            <p style={{ marginBottom: '0.65rem' }}>
              Set a new password for <strong>{resetPasswordUser.displayName}</strong> ({resetPasswordUser.username}).
              They will be required to change it on next login.
            </p>
            <form className="form-grid" onSubmit={(e) => void submitResetPassword(e)}>
              <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New temporary password" minLength={6} required autoFocus />
              <div className="modal-footer">
                <button type="button" className="button button-ghost" onClick={() => setResetPasswordUser(null)}>Cancel</button>
                <button type="submit" className="button button-primary">Reset Password</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit User (Role & Team) Modal */}
      {editingUser ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}>
          <div className="modal">
            <h3>✏️ Edit User</h3>
            <p style={{ marginBottom: '0.65rem' }}>
              Editing <strong>{editingUser.displayName}</strong> ({editingUser.username})
            </p>
            <form className="form-grid" onSubmit={(e) => void submitEditUser(e)}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Role</label>
              <select className="select" value={editRole} onChange={(e) => setEditRole(e.target.value as 'ADMIN' | 'MEMBER' | 'DRIVER' | 'LEADER' | 'MAID' | 'CHEF')}>
                <option value="MEMBER">MEMBER</option>
                <option value="LEADER">LEADER</option>
                <option value="DRIVER">DRIVER</option>
                <option value="MAID">MAID</option>
                <option value="CHEF">CHEF</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Team</label>
              <select className="select" value={editTeamId} onChange={(e) => setEditTeamId(e.target.value)}>
                <option value="">Service (no team)</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <div className="modal-footer">
                <button type="button" className="button button-ghost" onClick={() => setEditingUser(null)}>Cancel</button>
                <button type="submit" className="button button-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Team Modal */}
      {editingTeam ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingTeam(null); }}>
          <div className="modal">
            <h3>✏️ Edit Team</h3>
            <form className="form-grid" onSubmit={(e) => void renameTeam(e)}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Team Name</label>
              <input className="input" value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} placeholder="Team name" required autoFocus />

              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Shift Segments</label>
              {editShiftRows.map((row, index) => (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Start {index + 1}</label>
                    <input
                      className="input"
                      type="time"
                      value={row.startTime}
                      onChange={(e) => updateShiftRow(row.id, 'startTime', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>End {index + 1}</label>
                    <input
                      className="input"
                      type="time"
                      value={row.endTime}
                      onChange={(e) => updateShiftRow(row.id, 'endTime', e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <button
                      type="button"
                      className="button button-danger button-sm"
                      onClick={() => removeShiftRow(row.id)}
                      disabled={editShiftRows.length === 1}
                      title="Remove shift"
                    >
                      -
                    </button>
                  </div>
                </div>
              ))}

              <div>
                <button type="button" className="button button-ghost button-sm" onClick={addShiftRow}>
                  + Add Shift
                </button>
              </div>

              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Effective From</label>
              <input className="input" type="date" value={editEffectiveFrom} onChange={(e) => setEditEffectiveFrom(e.target.value)} required />

              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                Add as many shifts as needed. Each new save creates a new preset and assignment from the effective date.
              </p>
              <div className="modal-footer">
                <button type="button" className="button button-ghost" onClick={() => setEditingTeam(null)}>Cancel</button>
                <button type="submit" className="button button-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
