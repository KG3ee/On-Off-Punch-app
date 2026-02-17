'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type Team = { id: string; name: string };

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

  // Team form state
  const [teamName, setTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editTeamName, setEditTeamName] = useState('');

  // User form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [teamId, setTeamId] = useState('');

  useEffect(() => {
    void load();
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

  async function createTeam(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await apiFetch('/teams/admin', {
        method: 'POST',
        body: JSON.stringify({ name: teamName })
      });
      setTeamName('');
      setMessage('Team created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    }
  }

  async function renameTeam(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingTeam) return;
    try {
      await apiFetch(`/teams/admin/${editingTeam.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editTeamName })
      });
      setEditingTeam(null);
      setEditTeamName('');
      setMessage('Team renamed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename team');
    }
  }

  async function deleteTeam(id: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this team?')) return;
    try {
      await apiFetch(`/teams/admin/${id}`, { method: 'DELETE' });
      setMessage('Team deleted');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  }

  function startEditTeam(team: Team) {
    setEditingTeam(team);
    setEditTeamName(team.name);
  }

  function cancelEditTeam() {
    setEditingTeam(null);
    setEditTeamName('');
  }

  async function createUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          displayName,
          username,
          password,
          role,
          teamId: teamId || undefined,
          mustChangePassword
        })
      });
      setFirstName('');
      setLastName('');
      setDisplayName('');
      setUsername('');
      setPassword('');
      setRole('EMPLOYEE');
      setTeamId('');
      setMustChangePassword(true);
      setMessage('User created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  }

  return (
    <AppShell title="Admin Users" subtitle="Create and manage username/password users" admin userRole="ADMIN">
      {message ? <p style={{ color: 'var(--ok)' }}>{message}</p> : null}
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <section className="split">
        <article className="card">
          <form className="form-grid" onSubmit={(event) => void createTeam(event)} style={{ marginBottom: '1.5rem' }}>
            <h3>Create Team</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="input"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="New team name"
                required
              />
              <button type="submit" className="button button-primary" style={{ flexShrink: 0 }}>
                Add
              </button>
            </div>
          </form>

          <h3>Manage Teams</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {teams.map((team) => (
              <li key={team.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                {editingTeam?.id === team.id ? (
                  <form onSubmit={(e) => void renameTeam(e)} style={{ display: 'flex', gap: '0.3rem', flex: 1 }}>
                    <input
                      className="input"
                      value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      autoFocus
                      required
                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                    />
                    <button type="submit" className="button button-ok button-sm">Save</button>
                    <button type="button" className="button button-ghost button-sm" onClick={cancelEditTeam}>✕</button>
                  </form>
                ) : (
                  <>
                    <span style={{ fontWeight: 500 }}>{team.name}</span>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button className="button button-ghost button-sm" onClick={() => startEditTeam(team)} title="Rename">✏️</button>
                      <button className="button button-danger button-sm" onClick={() => void deleteTeam(team.id)} title="Delete">🗑️</button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {teams.length === 0 ? <li style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>No teams found</li> : null}
          </ul>
        </article>

        <form className="card form-grid" onSubmit={(event) => void createUser(event)}>
          <h3>Create User</h3>
          <input
            className="input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            required
          />
          <input
            className="input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
          />
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            required
          />
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password"
            minLength={6}
            required
          />
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'EMPLOYEE')}>
            <option value="EMPLOYEE">EMPLOYEE</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">No team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={mustChangePassword}
              onChange={(e) => setMustChangePassword(e.target.checked)}
            />
            Force password change on first login
          </label>
          <button type="submit" className="button button-primary">
            Add User
          </button>
        </form>
      </section>

      <section className="card table-wrap">
        <h3>Users</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Team</th>
              <th>Password Change</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.displayName}</td>
                <td className="mono">{user.username}</td>
                <td>{user.role}</td>
                <td>{user.team?.name || '-'}</td>
                <td>{user.mustChangePassword ? 'Required' : 'No'}</td>
                <td>
                  <span className={`tag ${user.isActive ? 'ok' : 'danger'}`}>
                    {user.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
