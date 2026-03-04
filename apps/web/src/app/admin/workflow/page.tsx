'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { MeUser } from '@/types/auth';

/* ── types ── */
type WorkflowStep = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  color: string;
};

type RoleWorkflow = {
  role: string;
  label: string;
  color: string;
  tagClass: string;
  summary: string;
  steps: WorkflowStep[];
  features: { icon: string; title: string; desc: string }[];
};

/* ── data ── */
const OVERVIEW_FLOW: { id: string; icon: string; label: string; desc: string; color: string }[] = [
  { id: 'register', icon: '\u{1F4DD}', label: 'Register', desc: 'New staff submits a registration request', color: 'var(--brand)' },
  { id: 'approve', icon: '\u2705', label: 'Admin Approves', desc: 'Admin reviews and approves the request', color: 'var(--ok)' },
  { id: 'login', icon: '\u{1F511}', label: 'Login', desc: 'Staff logs in with credentials', color: 'var(--brand)' },
  { id: 'punch', icon: '\u{1F552}', label: 'Punch On/Off', desc: 'Staff punches in to start / out to end shift', color: 'var(--ok)' },
  { id: 'work', icon: '\u{1F4BC}', label: 'Work & Breaks', desc: 'Take breaks, submit requests during shift', color: 'var(--warning)' },
  { id: 'review', icon: '\u{1F50D}', label: 'Leader Reviews', desc: 'Leader triages violations while Admin handles request approvals', color: '#a78bfa' },
  { id: 'admin', icon: '\u{1F6E0}\uFE0F', label: 'Admin Manages', desc: 'Admin finalizes, manages shifts & users', color: '#f87171' },
  { id: 'report', icon: '\u{1F4CA}', label: 'Reports', desc: 'View attendance history, points & analytics', color: 'var(--brand)' },
];

const ROLES: RoleWorkflow[] = [
  {
    role: 'MEMBER',
    label: 'Member',
    color: '#4ade80',
    tagClass: 'role-member',
    summary: 'Regular staff member who punches in/out, takes breaks, submits requests, and reports violations.',
    steps: [
      { id: 'm1', icon: '\u{1F511}', title: 'Login', desc: 'Log in with your username and password. If required by admin, change your password on first login.', color: 'var(--brand)' },
      { id: 'm2', icon: '\u{1F7E2}', title: 'Punch On', desc: 'Click the green "PUNCH ON" button to start your duty session. Your shift is automatically detected.', color: 'var(--ok)' },
      { id: 'm3', icon: '\u2615', title: 'Take Breaks', desc: 'Use keyboard shortcuts (B=Bathroom, W=WC, C=Cigarette, 1/2/3=Coffee) or click break buttons. Each break type has a session limit.', color: 'var(--warning)' },
      { id: 'm4', icon: '\u{1F4CB}', title: 'Submit Requests', desc: 'Go to Requests tab to submit shift change requests (half-day, full day off) or driver requests for transportation.', color: 'var(--brand)' },
      { id: 'm5', icon: '\u{1F6A8}', title: 'Report Violations', desc: 'Report anonymous violations against other staff. Select the person, reason, and add notes. Your identity stays anonymous to leaders.', color: 'var(--danger)' },
      { id: 'm6', icon: '\u{1F534}', title: 'Punch Off', desc: 'Click the red "PUNCH OFF" button to end your duty session. Late minutes and overtime are calculated automatically.', color: 'var(--danger)' },
    ],
    features: [
      { icon: '\u{1F4F6}', title: 'Offline Support', desc: 'Punch and break actions work offline and sync when connection returns' },
      { icon: '\u{1F514}', title: 'Notifications', desc: 'Get notified when your requests are approved or rejected' },
      { icon: '\u{1F4CA}', title: 'Monthly Summary', desc: 'View your total hours, late count, overtime, and attendance stats' },
      { icon: '\u2328\uFE0F', title: 'Keyboard Shortcuts', desc: 'Quick break shortcuts: B, W, C, 1, 2, 3 for different break types' },
    ],
  },
  {
    role: 'LEADER',
    label: 'Leader',
    color: '#a78bfa',
    tagClass: 'role-leader',
    summary: 'Team supervisor who monitors team attendance and triages violation reports before admin finalization.',
    steps: [
      { id: 'l1', icon: '\u{1F511}', title: 'Login', desc: 'Log in with leader role and use the main dashboard navigation.', color: 'var(--brand)' },
      { id: 'l2', icon: '\u{1F465}', title: 'Track Team Status', desc: 'Monitor team status from live/dashboard views and notifications.', color: 'var(--ok)' },
      { id: 'l3', icon: '\u2705', title: 'Review Requests', desc: 'Coordinate team requests and escalate decisions. Final shift request approval is handled by Admin.', color: '#a78bfa' },
      { id: 'l4', icon: '\u{1F6E1}\uFE0F', title: 'Triage Violations', desc: 'Review team violation cases. Mark as VALID or INVALID for admin final decision.', color: 'var(--warning)' },
      { id: 'l5', icon: '\u{1F441}\uFE0F', title: 'Observed Incidents', desc: 'Create leader-observed violation cases when incidents happen on shift.', color: 'var(--danger)' },
      { id: 'l6', icon: '\u{1F4CA}', title: 'Follow Up', desc: 'Track case outcomes and team actions after admin finalization.', color: 'var(--brand)' },
    ],
    features: [
      { icon: '\u{1F4E1}', title: 'Team Visibility', desc: 'Monitor current team status using dashboard data and notifications' },
      { icon: '\u{1F4E8}', title: 'Request Coordination', desc: 'Coordinate team requests and route final approvals to admin' },
      { icon: '\u{1F6A8}', title: 'Violation Triage', desc: 'First-level review of violation cases for your team' },
      { icon: '\u{1F4C5}', title: 'Observed Cases', desc: 'Submit observed violation incidents directly as leader' },
    ],
  },
  {
    role: 'DRIVER',
    label: 'Driver',
    color: '#38bdf8',
    tagClass: 'role-driver',
    summary: 'Logistics operator who manages availability, accepts trip assignments, and completes driver requests.',
    steps: [
      { id: 'd1', icon: '\u{1F511}', title: 'Login', desc: 'Log in and you\'ll be directed to the Driver dashboard.', color: 'var(--brand)' },
      { id: 'd2', icon: '\u{1F7E2}', title: 'Set Status', desc: 'Set your availability: AVAILABLE, BUSY, ON BREAK, or OFFLINE. Other staff can see your current status.', color: 'var(--ok)' },
      { id: 'd3', icon: '\u{1F4CB}', title: 'View Requests', desc: 'See available trip requests from other staff. Requests show destination, time, and round-trip status.', color: 'var(--brand)' },
      { id: 'd4', icon: '\u{1F91D}', title: 'Accept Assignment', desc: 'Accept approved trip requests assigned to you by Admin. The request moves to IN PROGRESS status.', color: '#a78bfa' },
      { id: 'd5', icon: '\u{1F697}', title: 'Complete Trip', desc: 'After completing the trip, mark it as COMPLETED. The requester gets notified.', color: 'var(--ok)' },
      { id: 'd6', icon: '\u{1F504}', title: 'Auto-Refresh', desc: 'Your dashboard refreshes every 15 seconds to show new requests and status changes.', color: 'var(--warning)' },
    ],
    features: [
      { icon: '\u{1F4CD}', title: 'Trip Details', desc: 'See destination, time, contact number, and round-trip info' },
      { icon: '\u{1F7E2}', title: 'Status Control', desc: 'Toggle between Available, Busy, On Break, and Offline' },
      { icon: '\u{1F504}', title: 'Live Updates', desc: 'Dashboard auto-refreshes every 15 seconds' },
      { icon: '\u{1F514}', title: 'Notifications', desc: 'Get notified when new trips are assigned to you' },
    ],
  },
  {
    role: 'CHEF',
    label: 'Chef',
    color: '#fbbf24',
    tagClass: 'role-chef',
    summary: 'Kitchen staff who can request meal pickup transportation through the driver request system.',
    steps: [
      { id: 'c1', icon: '\u{1F511}', title: 'Login', desc: 'Log in with your credentials to access the dashboard.', color: 'var(--brand)' },
      { id: 'c2', icon: '\u{1F7E2}', title: 'Punch On', desc: 'Start your shift by punching on. Same process as regular members.', color: 'var(--ok)' },
      { id: 'c3', icon: '\u{1F355}', title: 'Request Meal Pickup', desc: 'Submit a MEAL_PICKUP driver request with destination and time. Admin assigns an available driver.', color: 'var(--warning)' },
      { id: 'c4', icon: '\u{1F4E6}', title: 'Track Request', desc: 'Monitor your request status: Pending > Approved > In Progress > Completed.', color: 'var(--brand)' },
      { id: 'c5', icon: '\u2615', title: 'Duty Session', desc: 'Manage punch on/off and meal pickup flow. Break buttons are hidden for CHEF role.', color: 'var(--warning)' },
      { id: 'c6', icon: '\u{1F534}', title: 'Punch Off', desc: 'End your shift by punching off.', color: 'var(--danger)' },
    ],
    features: [
      { icon: '\u{1F355}', title: 'Meal Pickup', desc: 'Special driver request category for kitchen logistics' },
      { icon: '\u{1F4CB}', title: 'Request Tracking', desc: 'Track meal pickup status in real time' },
      { icon: '\u{1F552}', title: 'Punch System', desc: 'Punch on/off and meal request workflow for kitchen operations' },
      { icon: '\u{1F514}', title: 'Notifications', desc: 'Get notified when your pickup is on the way' },
    ],
  },
  {
    role: 'ADMIN',
    label: 'Admin',
    color: '#f87171',
    tagClass: 'role-admin',
    summary: 'Full system administrator who manages users, shifts, requests, violations, and views all reports.',
    steps: [
      { id: 'a1', icon: '\u{1F511}', title: 'Login', desc: 'Log in to the Admin dashboard with full system access.', color: 'var(--brand)' },
      { id: 'a2', icon: '\u{1F4E1}', title: 'Live Board', desc: 'Monitor all staff in real-time: who is on duty, on break, or absent. Admin can punch on/off from header for their own admin session.', color: 'var(--ok)' },
      { id: 'a3', icon: '\u{1F465}', title: 'Manage Users', desc: 'Create, edit, deactivate users. Approve new registration requests. Reset passwords and assign roles/teams.', color: '#f87171' },
      { id: 'a4', icon: '\u{1F4C5}', title: 'Manage Shifts', desc: 'Create multi-segment shift presets. Assign shifts to teams or individuals. Set date-specific overrides.', color: '#a78bfa' },
      { id: 'a5', icon: '\u2705', title: 'Review Requests', desc: 'Approve/reject shift changes. Assign drivers to trip requests. Finalize violations with point rewards/deductions.', color: 'var(--warning)' },
      { id: 'a6', icon: '\u{1F4CA}', title: 'Reports & History', desc: 'View attendance history, break reports, violation points ledger. Filter by date, team, and user. Export CSV.', color: 'var(--brand)' },
    ],
    features: [
      { icon: '\u{1F6E0}\uFE0F', title: 'User Management', desc: 'Create, edit, deactivate users and approve registrations' },
      { icon: '\u{1F4C5}', title: 'Shift Management', desc: 'Create presets with multi-segment shifts and overrides' },
      { icon: '\u{1F4CB}', title: 'Request Center', desc: 'Unified view of shift, driver, and violation requests' },
      { icon: '\u{1F4CA}', title: 'Analytics', desc: 'Attendance history, break reports, and violation points' },
      { icon: '\u{1F552}', title: 'Admin Punch', desc: 'Quick punch on/off controls in admin header for the admin account session' },
      { icon: '\u{1F4E4}', title: 'CSV Export', desc: 'Export violation points and attendance data' },
    ],
  },
  {
    role: 'MAID',
    label: 'Maid',
    color: '#f472b6',
    tagClass: 'role-maid',
    summary: 'Support staff with standard attendance tracking features - punch on/off and requests.',
    steps: [
      { id: 'md1', icon: '\u{1F511}', title: 'Login', desc: 'Log in with your credentials.', color: 'var(--brand)' },
      { id: 'md2', icon: '\u{1F7E2}', title: 'Punch On', desc: 'Start your shift by punching on.', color: 'var(--ok)' },
      { id: 'md3', icon: '\u2615', title: 'Duty Rules', desc: 'Maid role follows duty tracking without break shortcut buttons.', color: 'var(--warning)' },
      { id: 'md4', icon: '\u{1F4CB}', title: 'Submit Requests', desc: 'Submit shift change requests or driver requests as needed.', color: 'var(--brand)' },
      { id: 'md5', icon: '\u{1F534}', title: 'Punch Off', desc: 'End your shift by punching off. Hours and overtime tracked automatically.', color: 'var(--danger)' },
    ],
    features: [
      { icon: '\u{1F552}', title: 'Punch System', desc: 'Full punch on/off with late and overtime tracking' },
      { icon: '\u2615', title: 'Duty Tracking', desc: 'Role follows punch and request flow without break shortcut buttons' },
      { icon: '\u{1F4CB}', title: 'Requests', desc: 'Submit shift change and driver requests' },
      { icon: '\u{1F514}', title: 'Notifications', desc: 'Get notified about request status changes' },
    ],
  },
];

/* ── violation workflow (shared) ── */
const VIOLATION_FLOW = [
  { step: 1, icon: '\u{1F6A8}', label: 'Member Reports', desc: 'Anonymous report submitted', color: 'var(--danger)', actor: 'Member' },
  { step: 2, icon: '\u{1F50D}', label: 'Leader Triages', desc: 'Marked as Valid or Invalid', color: '#a78bfa', actor: 'Leader' },
  { step: 3, icon: '\u2696\uFE0F', label: 'Admin Finalizes', desc: 'Confirmed or Rejected', color: '#f87171', actor: 'Admin' },
  { step: 4, icon: '\u{1F3C6}', label: 'Points Applied', desc: 'Points may be applied based on admin decision', color: 'var(--ok)', actor: 'System' },
];

const DRIVER_REQUEST_FLOW = [
  { step: 1, icon: '\u{1F4DD}', label: 'Staff Requests', desc: 'Submit trip with destination & time', color: 'var(--brand)', actor: 'Any Staff' },
  { step: 2, icon: '\u2705', label: 'Admin Approves', desc: 'Assigns an available driver', color: '#f87171', actor: 'Admin' },
  { step: 3, icon: '\u{1F91D}', label: 'Driver Accepts', desc: 'Driver accepts the assignment', color: '#38bdf8', actor: 'Driver' },
  { step: 4, icon: '\u{1F697}', label: 'Trip Completed', desc: 'Driver marks trip as done', color: 'var(--ok)', actor: 'Driver' },
];

const SHIFT_REQUEST_FLOW = [
  { step: 1, icon: '\u{1F4CB}', label: 'Member Submits', desc: 'Half-day, full day off, or custom', color: 'var(--brand)', actor: 'Member' },
  { step: 2, icon: '\u{1F50D}', label: 'Admin Reviews', desc: 'Admin approves or rejects the request', color: '#f87171', actor: 'Admin' },
  { step: 3, icon: '\u{1F514}', label: 'Member Notified', desc: 'Get notified of the decision', color: 'var(--ok)', actor: 'System' },
];

/* ── Component ── */
export default function AdminWorkflowPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'roles' | 'workflows'>('overview');

  useEffect(() => {
    apiFetch<MeUser>('/me').then(setMe).catch(() => {});
  }, []);

  const selectedRoleData = ROLES.find((r) => r.role === selectedRole);

  return (
    <AppShell title="How It Works" subtitle="Visual workflow guide" admin={true} userRole={me?.role}>
      {/* Intro */}
      <div className="wf-intro">
        <h2 className="wf-hero-title">Welcome to Modern Punch</h2>
        <p className="wf-hero-desc">
          Understand how the entire system works - from registration to daily operations.
          Click on any role to see their specific workflow and features.
        </p>
      </div>

      {/* Section tabs */}
      <div className="wf-section-tabs">
        <button
          className={`wf-section-tab ${activeSection === 'overview' ? 'active' : ''}`}
          onClick={() => { setActiveSection('overview'); setSelectedRole(null); }}
        >
          System Overview
        </button>
        <button
          className={`wf-section-tab ${activeSection === 'roles' ? 'active' : ''}`}
          onClick={() => setActiveSection('roles')}
        >
          Role Guides
        </button>
        <button
          className={`wf-section-tab ${activeSection === 'workflows' ? 'active' : ''}`}
          onClick={() => { setActiveSection('workflows'); setSelectedRole(null); }}
        >
          Key Workflows
        </button>
      </div>

      {/* ────────── OVERVIEW ────────── */}
      {activeSection === 'overview' && (
        <div className="wf-section">
          <h3 className="wf-section-title">System Flow</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            How a typical journey works from start to finish
          </p>

          <div className="wf-flow-vertical">
            {OVERVIEW_FLOW.map((step, i) => (
              <div key={step.id} className="wf-flow-step">
                <div className="wf-flow-line-wrap">
                  <div className="wf-flow-dot" style={{ borderColor: step.color, boxShadow: `0 0 12px ${step.color}40` }}>
                    <span className="wf-flow-icon">{step.icon}</span>
                  </div>
                  {i < OVERVIEW_FLOW.length - 1 && <div className="wf-flow-connector" />}
                </div>
                <div className="wf-flow-content">
                  <div className="wf-flow-label">{step.label}</div>
                  <div className="wf-flow-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Role cards preview */}
          <h3 className="wf-section-title" style={{ marginTop: '2.5rem' }}>Roles in the System</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Click any role to see their detailed workflow
          </p>
          <div className="wf-role-grid">
            {ROLES.map((r) => (
              <button
                key={r.role}
                className="wf-role-card"
                onClick={() => { setSelectedRole(r.role); setActiveSection('roles'); }}
                style={{ '--role-color': r.color } as React.CSSProperties}
              >
                <div className="wf-role-header">
                  <span className={`tag ${r.tagClass}`}>{r.label}</span>
                </div>
                <p className="wf-role-summary">{r.summary}</p>
                <span className="wf-role-cta">View workflow &rarr;</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ────────── ROLES ────────── */}
      {activeSection === 'roles' && (
        <div className="wf-section">
          {/* Role picker */}
          <div className="wf-role-picker">
            {ROLES.map((r) => (
              <button
                key={r.role}
                className={`wf-role-pill ${selectedRole === r.role ? 'active' : ''}`}
                onClick={() => setSelectedRole(r.role)}
                style={{ '--role-color': r.color } as React.CSSProperties}
              >
                <span className={`tag ${r.tagClass}`} style={{ fontSize: '0.7rem' }}>{r.label}</span>
              </button>
            ))}
          </div>

          {!selectedRoleData && (
            <div className="wf-empty-state">
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{'\u{1F446}'}</div>
              <p>Select a role above to see their detailed workflow</p>
            </div>
          )}

          {selectedRoleData && (
            <div className="wf-role-detail" style={{ '--role-color': selectedRoleData.color } as React.CSSProperties}>
              {/* Role header */}
              <div className="wf-role-detail-header">
                <span className={`tag ${selectedRoleData.tagClass}`} style={{ fontSize: '0.85rem' }}>
                  {selectedRoleData.label}
                </span>
                <p className="wf-role-detail-desc">{selectedRoleData.summary}</p>
              </div>

              {/* Step-by-step */}
              <h4 className="wf-sub-title">Step-by-Step Workflow</h4>
              <div className="wf-steps-timeline">
                {selectedRoleData.steps.map((step, i) => (
                  <div key={step.id} className="wf-timeline-item">
                    <div className="wf-timeline-left">
                      <div className="wf-timeline-number" style={{ background: step.color }}>
                        {i + 1}
                      </div>
                      {i < selectedRoleData.steps.length - 1 && (
                        <div className="wf-timeline-line" />
                      )}
                    </div>
                    <div className="wf-timeline-card">
                      <div className="wf-timeline-card-icon">{step.icon}</div>
                      <div>
                        <div className="wf-timeline-card-title">{step.title}</div>
                        <div className="wf-timeline-card-desc">{step.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Features grid */}
              <h4 className="wf-sub-title" style={{ marginTop: '2rem' }}>Key Features</h4>
              <div className="wf-features-grid">
                {selectedRoleData.features.map((f, i) => (
                  <div key={i} className="wf-feature-card">
                    <div className="wf-feature-icon">{f.icon}</div>
                    <div className="wf-feature-title">{f.title}</div>
                    <div className="wf-feature-desc">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────── WORKFLOWS ────────── */}
      {activeSection === 'workflows' && (
        <div className="wf-section">
          {/* Violation workflow */}
          <div className="wf-workflow-block">
            <h3 className="wf-workflow-title">
              <span style={{ marginRight: '0.5rem' }}>{'\u{1F6A8}'}</span>
              Violation Reporting Workflow
            </h3>
            <p className="wf-workflow-desc">3-tier review process: Member reports anonymously, Leader validates, Admin finalizes with point system.</p>
            <div className="wf-pipeline">
              {VIOLATION_FLOW.map((s, i) => (
                <div key={i} className="wf-pipeline-step">
                  <div className="wf-pipeline-node" style={{ borderColor: s.color }}>
                    <span className="wf-pipeline-icon">{s.icon}</span>
                  </div>
                  <div className="wf-pipeline-label">{s.label}</div>
                  <div className="wf-pipeline-desc">{s.desc}</div>
                  <span className="wf-pipeline-actor" style={{ color: s.color }}>{s.actor}</span>
                  {i < VIOLATION_FLOW.length - 1 && <div className="wf-pipeline-arrow">{'\u2192'}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Driver request workflow */}
          <div className="wf-workflow-block">
            <h3 className="wf-workflow-title">
              <span style={{ marginRight: '0.5rem' }}>{'\u{1F697}'}</span>
              Driver Request Workflow
            </h3>
            <p className="wf-workflow-desc">Staff request transportation, Admin assigns a driver, Driver completes the trip.</p>
            <div className="wf-pipeline">
              {DRIVER_REQUEST_FLOW.map((s, i) => (
                <div key={i} className="wf-pipeline-step">
                  <div className="wf-pipeline-node" style={{ borderColor: s.color }}>
                    <span className="wf-pipeline-icon">{s.icon}</span>
                  </div>
                  <div className="wf-pipeline-label">{s.label}</div>
                  <div className="wf-pipeline-desc">{s.desc}</div>
                  <span className="wf-pipeline-actor" style={{ color: s.color }}>{s.actor}</span>
                  {i < DRIVER_REQUEST_FLOW.length - 1 && <div className="wf-pipeline-arrow">{'\u2192'}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Shift request workflow */}
          <div className="wf-workflow-block">
            <h3 className="wf-workflow-title">
              <span style={{ marginRight: '0.5rem' }}>{'\u{1F4C5}'}</span>
              Shift Change Request Workflow
            </h3>
            <p className="wf-workflow-desc">Members submit shift changes, then Admin reviews and approves or rejects.</p>
            <div className="wf-pipeline">
              {SHIFT_REQUEST_FLOW.map((s, i) => (
                <div key={i} className="wf-pipeline-step">
                  <div className="wf-pipeline-node" style={{ borderColor: s.color }}>
                    <span className="wf-pipeline-icon">{s.icon}</span>
                  </div>
                  <div className="wf-pipeline-label">{s.label}</div>
                  <div className="wf-pipeline-desc">{s.desc}</div>
                  <span className="wf-pipeline-actor" style={{ color: s.color }}>{s.actor}</span>
                  {i < SHIFT_REQUEST_FLOW.length - 1 && <div className="wf-pipeline-arrow">{'\u2192'}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Registration workflow */}
          <div className="wf-workflow-block">
            <h3 className="wf-workflow-title">
              <span style={{ marginRight: '0.5rem' }}>{'\u{1F4DD}'}</span>
              New Staff Registration
            </h3>
            <p className="wf-workflow-desc">New staff submit a registration request, Admin reviews and approves, then staff can log in.</p>
            <div className="wf-pipeline">
              {[
                { icon: '\u{1F4DD}', label: 'Submit Request', desc: 'Name, username, staff code', color: 'var(--brand)', actor: 'New Staff' },
                { icon: '\u{1F50D}', label: 'Admin Reviews', desc: 'Verify identity & approve', color: '#f87171', actor: 'Admin' },
                { icon: '\u{1F511}', label: 'First Login', desc: 'If required, change password on first login', color: 'var(--ok)', actor: 'New Staff' },
              ].map((s, i, arr) => (
                <div key={i} className="wf-pipeline-step">
                  <div className="wf-pipeline-node" style={{ borderColor: s.color }}>
                    <span className="wf-pipeline-icon">{s.icon}</span>
                  </div>
                  <div className="wf-pipeline-label">{s.label}</div>
                  <div className="wf-pipeline-desc">{s.desc}</div>
                  <span className="wf-pipeline-actor" style={{ color: s.color }}>{s.actor}</span>
                  {i < arr.length - 1 && <div className="wf-pipeline-arrow">{'\u2192'}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
