'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type Team = { id: string; name: string; shiftStartTime?: string | null; shiftEndTime?: string | null };

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName?: string;
  role: 'ADMIN' | 'EMPLOYEE';
  team?: Team | null;
  isActive: boolean;
  mustChangePassword: boolean;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
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
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [teamId, setTeamId] = useState('');

  // Create team form
  const [teamName, setTeamName] = useState('');
  const [teamShiftStart, setTeamShiftStart] = useState('');
  const [teamShiftEnd, setTeamShiftEnd] = useState('');
  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftEnd, setEditShiftEnd] = useState('');

  // Action menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset password modal
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Edit user modal
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [editTeamId, setEditTeamId] = useState('');

  useEffect(() => {
    void load();
  }, []);

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

  async function load(): Promise<void> {
    try {
      const [userData, teamData] = await Promise.all([
        apiFetch<UserRow[]>('/admin/users'),
        apiFetch<Team[]>('/teams')
      ]);
      setUsers(userData);
      setTeams(teamData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  }

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
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
    try {
      await apiFetch(`/teams/admin/${editingTeam.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editTeamName,
          shiftStartTime: editShiftStart || undefined,
          shiftEndTime: editShiftEnd || undefined,
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
      setUsername(''); setPassword(''); setRole('EMPLOYEE');
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

  // ── Filter ──
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
      || (u.team?.name || '').toLowerCase().includes(q);
  });

  return (
    <AppShell title="Users & Teams" subtitle="Manage employees, roles, and teams" admin userRole="ADMIN">
      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">⚠ {error}</div> : null}

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="input-search">
          <input
            className="input"
            placeholder="Search by name, username, or team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="toolbar-spacer" />
        <button type="button" className="button button-ghost button-sm" onClick={() => setShowCreateTeam(true)}>
          + Team
        </button>
        <button type="button" className="button button-primary" onClick={() => setShowCreateUser(true)}>
          + New User
        </button>
      </div>

      {/* ── Users Table ── */}
      <article className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Team</th>
              <th>Role</th>
              <th>Status</th>
              <th>PW Change</th>
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td style={{ fontWeight: 500 }}>{user.displayName}</td>
                <td className="mono">{user.username}</td>
                <td>{user.team ? <span className="tag brand">{user.team.name}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td>
                  <span className={`tag ${user.role === 'ADMIN' ? 'warning' : ''}`}>
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
                      <div className="action-menu">
                        <button onClick={() => openEditUser(user)}>✏️ Edit Role &amp; Team</button>
                        <button onClick={() => openResetPassword(user)}>🔑 Reset Password</button>
                        <button
                          onClick={() => void updateUserField(user.id, { isActive: !user.isActive })}
                        >
                          {user.isActive ? '🚫 Deactivate' : '✅ Reactivate'}
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

      {/* ── Teams Table ── */}
      <article className="card">
        <h3>Teams</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Shift Start</th>
                <th>Shift End</th>
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
                    <td className="mono">{team.shiftStartTime || '—'}</td>
                    <td className="mono">{team.shiftEndTime || '—'}</td>
                    <td>{memberCount}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button
                          type="button"
                          className="button button-ghost button-sm"
                          onClick={() => {
                            setEditingTeam(team);
                            setEditTeamName(team.name);
                            setEditShiftStart(team.shiftStartTime || '');
                            setEditShiftEnd(team.shiftEndTime || '');
                          }}
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
                <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: '1.5rem' }}>No teams yet &mdash; click &ldquo;+ Team&rdquo; to create one</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
                <select className="select" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'EMPLOYEE')}>
                  <option value="EMPLOYEE">EMPLOYEE</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">No team</option>
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
              <select className="select" value={editRole} onChange={(e) => setEditRole(e.target.value as 'ADMIN' | 'EMPLOYEE')}>
                <option value="EMPLOYEE">EMPLOYEE</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Team</label>
              <select className="select" value={editTeamId} onChange={(e) => setEditTeamId(e.target.value)}>
                <option value="">No team</option>
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
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Shift Schedule</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Start Time</label>
                  <input className="input" type="time" value={editShiftStart} onChange={(e) => setEditShiftStart(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>End Time</label>
                  <input className="input" type="time" value={editShiftEnd} onChange={(e) => setEditShiftEnd(e.target.value)} />
                </div>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                Leave empty for no shift tracking. Punch before start = early overtime, punch after end = late overtime.
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
