import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  Layers,
  Cpu,
  Award,
  Sliders,
  FileSearch,
  Plus,
  Search,
  Download,
  FileSpreadsheet,
  ShieldAlert,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { DashboardShell, NavItem } from '../components/DashboardShell';
import { apiFetch, exportToCsv } from '../lib/api';
import { useToast } from '../context/ToastContext';

const ADMIN_NAV: NavItem[] = [
  { id: 'overview', label: '1. Overview', icon: LayoutDashboard, group: 'Administrator' },
  { id: 'workers-machines', label: '2. Workers & Machines', icon: Cpu, group: 'Administrator' },
  { id: 'users', label: '3. User Management', icon: Users, group: 'Administrator' },
];

export const AdminDashboard: React.FC = () => {
  const { notify, confirmAction } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<any>(null);
  const [factories, setFactories] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);

  // Filters & Pagination
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [auditSearch, setAuditSearch] = useState('');

  // Forms
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    employeeCode: '',
    role: 'WORKER',
    departmentId: '',
    phone: '',
    password: '',
    designation: 'Line Specialist',
  });

  const [newFactory, setNewFactory] = useState({
    name: '',
    factoryCode: '',
    location: '',
    contactEmail: '',
    contactPhone: '',
    operatingHours: '24x6 Three-Shift Continuous',
  });

  const [newDept, setNewDept] = useState({
    factoryId: '',
    code: '',
    name: '',
    managerId: '',
    targetEfficiencyPct: 90,
  });

  const [newMachine, setNewMachine] = useState({
    departmentId: '',
    machineCode: '',
    name: '',
    machineType: 'CNC Machining',
    capacityUnitsPerHr: 45,
    requiredSkillCode: 'CNC_MILLING',
    requiredCertName: 'ISO Precision Machining L2',
    instructions: 'Complete pre-shift calibration and verify safety interlocks.',
  });

  const [newSkill, setNewSkill] = useState({
    code: '',
    name: '',
    category: 'Machining',
    description: '',
  });

  const [newCert, setNewCert] = useState({
    workerId: '',
    name: 'ISO Precision Machining L2',
    issuingBody: 'National Industrial Safety Board',
    expiryDate: '2028-06-30',
    skillId: '',
    proficiencyLevel: 4,
  });

  // System Config state
  const [configState, setConfigState] = useState({
    factoryId: '',
    name: '',
    operatingHours: '',
    alertThresholdPct: 85,
    maintReminderDays: 14,
  });

  const loadAllAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, fac, dep, usr, mch, wrk, aud] = await Promise.all([
        apiFetch('/api/admin/overview'),
        apiFetch('/api/admin/factories'),
        apiFetch('/api/admin/departments'),
        apiFetch('/api/admin/users'),
        apiFetch('/api/machines'),
        apiFetch('/api/workers'),
        apiFetch('/api/admin/audit-logs'),
      ]);
      setOverview(ov);
      setFactories(fac.factories);
      setDepartments(dep.departments);
      setUsers(usr.users);
      setMachines(mch.machines);
      setWorkers(wrk.workers);
      setAudits(aud.logs);

      if (fac.factories[0]) {
        const f = fac.factories[0];
        setConfigState({
          factoryId: f.id,
          name: f.name,
          operatingHours: f.operating_hours,
          alertThresholdPct: f.alert_threshold_pct,
          maintReminderDays: f.maint_reminder_days,
        });
        setNewDept((prev) => ({ ...prev, factoryId: prev.factoryId || f.id }));
      }
      if (dep.departments[0]) {
        const dId = dep.departments[0].id;
        setNewUser((prev) => ({ ...prev, departmentId: prev.departmentId || dId }));
        setNewMachine((prev) => ({ ...prev, departmentId: prev.departmentId || dId }));
      }
      if (wrk.workers[0]) {
        setNewCert((prev) => ({ ...prev, workerId: prev.workerId || wrk.workers[0].id }));
      }
    } catch (err: any) {
      notify('error', 'Failed to load administration records', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      notify('success', 'User Provisioned', `${newUser.fullName} added with role ${newUser.role}.`);
      setNewUser({
        ...newUser,
        fullName: '',
        email: '',
        employeeCode: '',
        phone: '',
        password: '',
      });
      loadAllAdminData();
    } catch (err: any) {
      notify('error', 'Could not create user', err.message);
    }
  };

  const handleToggleUserStatus = (u: any) => {
    confirmAction({
      title: u.is_active ? `Deactivate ${u.full_name}?` : `Activate ${u.full_name}?`,
      description: u.is_active
        ? `This immediately revokes login access for ${u.email} (${u.employee_code}) and logs an administrative audit event.`
        : `Restore active platform permissions for ${u.email}.`,
      confirmLabel: u.is_active ? 'Deactivate Account' : 'Activate Account',
      variant: u.is_active ? 'danger' : 'primary',
      onConfirm: async () => {
        try {
          await apiFetch(`/api/admin/users/${u.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: !u.is_active }),
          });
          notify('success', 'Account status updated');
          loadAllAdminData();
        } catch (err: any) {
          notify('error', 'Update failed', err.message);
        }
      },
    });
  };

  const handleChangeRole = async (userId: string, nextRole: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      notify('success', 'Role assignment updated', `Audit log recorded for role transition to ${nextRole}.`);
      loadAllAdminData();
    } catch (err: any) {
      notify('error', 'Role change failed', err.message);
    }
  };

  const handleCreateFactory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/factories', {
        method: 'POST',
        body: JSON.stringify(newFactory),
      });
      notify('success', 'Factory Registered', `${newFactory.name} added.`);
      setNewFactory({
        name: '',
        factoryCode: '',
        location: '',
        contactEmail: '',
        contactPhone: '',
        operatingHours: '24x6 Three-Shift Continuous',
      });
      loadAllAdminData();
    } catch (err: any) {
      notify('error', 'Failed to register factory', err.message);
    }
  };

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/departments', {
        method: 'POST',
        body: JSON.stringify(newDept),
      });
      notify('success', 'Department Created', `${newDept.name} (${newDept.code}) added.`);
      setNewDept({ ...newDept, code: '', name: '' });
      loadAllAdminData();
    } catch (err: any) {
      notify('error', 'Failed to create department', err.message);
    }
  };

  const handleCreateMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/machines', {
        method: 'POST',
        body: JSON.stringify(newMachine),
      });
      notify('success', 'Machine Registered', `${newMachine.machineCode} added to plant registry.`);
      setNewMachine({ ...newMachine, machineCode: '', name: '' });
      loadAllAdminData();
    } catch (err: any) {
      notify('error', 'Machine registration error', err.message);
    }
  };

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/skills', {
        method: 'POST',
        body: JSON.stringify(newSkill),
      });
      notify('success', 'Skill Registered', `${newSkill.code} added to qualification catalog.`);
      setNewSkill({ code: '', name: '', category: 'Machining', description: '' });
      loadAllAdminData();
    } catch (err: any) {
      notify('error', 'Skill error', err.message);
    }
  };

  const handleGrantCert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/certifications', {
        method: 'POST',
        body: JSON.stringify(newCert),
      });
      notify('success', 'Certification Issued', 'Worker qualification updated for Recovery Engine checks.');
      loadAllAdminData();
    } catch (err: any) {
      notify('error', 'Certification error', err.message);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configState.factoryId) return;
    try {
      await apiFetch(`/api/admin/factories/${configState.factoryId}`, {
        method: 'PATCH',
        body: JSON.stringify(configState),
      });
      notify('success', 'System Configuration Saved', 'Operational alert thresholds and operating schedule updated.');
      loadAllAdminData();
    } catch (err: any) {
      notify('error', 'Configuration error', err.message);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !userSearch ||
      u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.employee_code.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = !userRoleFilter || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const USERS_PER_PAGE = 10;
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice((userPage - 1) * USERS_PER_PAGE, userPage * USERS_PER_PAGE);

  const filteredAudits = audits.filter(
    (a) =>
      !auditSearch ||
      a.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
      a.description.toLowerCase().includes(auditSearch.toLowerCase()) ||
      a.user_name.toLowerCase().includes(auditSearch.toLowerCase())
  );

  const currentNav = ADMIN_NAV.find((n) => n.id === activeTab) || ADMIN_NAV[0];

  return (
    <DashboardShell
      roleTitle="Administrator"
      accentHex="#FF8A32"
      navItems={ADMIN_NAV}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      pageTitle={currentNav.label}
      breadcrumbSub="Plant Configuration & Identity Governance"
      headerActions={
        <button
          onClick={() => exportToCsv(`factorypulse_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`, audits)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Export Audit CSV
        </button>
      }
    >
      {loading && !overview ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 bg-[#242A33] border border-neutral-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* TAB 1: SYSTEM OVERVIEW */}
          {activeTab === 'overview' && overview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Factories', val: overview.kpis.totalFactories, sub: 'Active facilities' },
                  { label: 'Departments', val: overview.kpis.totalDepartments, sub: 'Configured units' },
                  { label: 'Total Users', val: overview.kpis.totalUsers, sub: `${overview.kpis.activeAccounts} active accounts` },
                  { label: 'Registered Machines', val: overview.kpis.registeredMachines, sub: 'Asset registry' },
                  { label: 'Floor Workers', val: overview.kpis.totalWorkers, sub: 'Verified operators' },
                  { label: 'Factory Managers', val: overview.kpis.totalManagers, sub: 'Department leads' },
                  { label: 'Technicians', val: overview.kpis.totalTechnicians, sub: 'Maintenance crew' },
                  { label: 'Audit Trail Events', val: audits.length, sub: 'Immutable records' },
                ].map((k) => (
                  <div key={k.label} className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
                    <p className="text-xs text-neutral-400">{k.label}</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-[#F5F6F8] mt-1">{k.val}</p>
                    <p className="text-xs text-neutral-500 mt-1">{k.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#F5F6F8]">Department Workforce & Machine Distribution</h3>
                      <p className="text-xs text-neutral-400">Live headcount and registered equipment across Northstar Manufacturing Works</p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overview.deptDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#171A21', borderColor: '#374151', color: '#F5F6F8', fontSize: 12 }}
                        />
                        <Bar dataKey="workers" name="Workers" fill="#FF8A32" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="machines" name="Machines" fill="#19C6B4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8] mb-3">Recent Administrative & Operational Audits</h3>
                  <div className="divide-y divide-neutral-800 max-h-64 overflow-y-auto">
                    {overview.recentAudits.slice(0, 7).map((a: any) => (
                      <div key={a.id} className="py-2.5 text-xs">
                        <div className="flex items-center justify-between text-neutral-400">
                          <span className="font-mono text-[#FF8A32]">{a.action}</span>
                          <span className="font-mono tabular-nums">
                            {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-neutral-200 mt-0.5">{a.description}</p>
                        <p className="text-neutral-500 mt-0.5">
                          {a.user_name} · {a.role_name}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FACTORY MANAGEMENT */}
          {activeTab === 'factories' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                {factories.map((f) => (
                  <div key={f.id} className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono text-[#FF8A32]">
                          {f.factory_code} {f.is_demo ? '· Demonstration Facility' : ''}
                        </p>
                        <h3 className="text-lg font-semibold text-[#F5F6F8] mt-0.5">{f.name}</h3>
                        <p className="text-xs text-neutral-300 mt-1">{f.location}</p>
                      </div>
                      <div className="text-right text-xs text-neutral-400 font-mono tabular-nums">
                        <p>{f.department_count} Departments</p>
                        <p className="mt-0.5">{f.machine_count} Machines</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-neutral-800 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-neutral-400">
                      <p>Schedule: <span className="text-neutral-200">{f.operating_hours}</span></p>
                      <p>Contact: <span className="text-neutral-200">{f.contact_email} · {f.contact_phone}</span></p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-5 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                <h3 className="text-base font-semibold text-[#F5F6F8]">Register Additional Plant Facility</h3>
                <form onSubmit={handleCreateFactory} className="space-y-3.5 mt-4">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Factory Name</label>
                    <input
                      type="text"
                      required
                      value={newFactory.name}
                      onChange={(e) => setNewFactory({ ...newFactory, name: e.target.value })}
                      placeholder="Northstar Precision Forging Unit 2"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Factory ID Code</label>
                    <input
                      type="text"
                      required
                      value={newFactory.factoryCode}
                      onChange={(e) => setNewFactory({ ...newFactory, factoryCode: e.target.value })}
                      placeholder="FAC-NMW-02"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Location</label>
                    <input
                      type="text"
                      required
                      value={newFactory.location}
                      onChange={(e) => setNewFactory({ ...newFactory, location: e.target.value })}
                      placeholder="Chakan MIDC Phase II, Pune"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Contact Email</label>
                      <input
                        type="email"
                        value={newFactory.contactEmail}
                        onChange={(e) => setNewFactory({ ...newFactory, contactEmail: e.target.value })}
                        placeholder="unit2@factorypulse.demo"
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Contact Phone</label>
                      <input
                        type="text"
                        value={newFactory.contactPhone}
                        onChange={(e) => setNewFactory({ ...newFactory, contactPhone: e.target.value })}
                        placeholder="+91 20 6720 1100"
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Operating Schedule</label>
                    <input
                      type="text"
                      value={newFactory.operatingHours}
                      onChange={(e) => setNewFactory({ ...newFactory, operatingHours: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 px-4 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f]"
                  >
                    Register Factory
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: DEPARTMENTS */}
          {activeTab === 'departments' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-neutral-800">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Operational Departments</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                      <tr>
                        <th className="py-3 px-4">Code</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Department Manager</th>
                        <th className="py-3 px-4 text-right">Workers</th>
                        <th className="py-3 px-4 text-right">Machines</th>
                        <th className="py-3 px-4 text-right">Target Eff.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {departments.map((d) => (
                        <tr key={d.id} className="hover:bg-[#2B323D]/50">
                          <td className="py-3 px-4 font-mono text-[#FF8A32]">{d.code}</td>
                          <td className="py-3 px-4 font-medium text-white">{d.name}</td>
                          <td className="py-3 px-4 text-neutral-300">{d.manager_name || 'Unassigned'}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{d.worker_count}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{d.machine_count}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#19C6B4]">
                            {d.target_efficiency_pct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-4 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                <h3 className="text-base font-semibold text-[#F5F6F8]">Create Department</h3>
                <form onSubmit={handleCreateDept} className="space-y-3.5 mt-4">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Parent Factory</label>
                    <select
                      value={newDept.factoryId}
                      onChange={(e) => setNewDept({ ...newDept, factoryId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                    >
                      {factories.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Department Code</label>
                    <input
                      type="text"
                      required
                      value={newDept.code}
                      onChange={(e) => setNewDept({ ...newDept, code: e.target.value })}
                      placeholder="DEPT-HTR"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Department Name</label>
                    <input
                      type="text"
                      required
                      value={newDept.name}
                      onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                      placeholder="Heat Treatment & Metallurgy"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Assign Manager</label>
                    <select
                      value={newDept.managerId}
                      onChange={(e) => setNewDept({ ...newDept, managerId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                    >
                      <option value="">Select Manager (Optional)</option>
                      {users
                        .filter((u) => u.role === 'MANAGER')
                        .map((m) => (
                          <option key={m.id} value={m.id}>{m.full_name}</option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 px-4 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f]"
                  >
                    Add Department
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: USER ADMINISTRATION */}
          {activeTab === 'users' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setUserPage(1);
                      }}
                      placeholder="Search name, email, or employee ID..."
                      className="w-full pl-9 pr-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => {
                      setUserRoleFilter(e.target.value);
                      setUserPage(1);
                    }}
                    className="px-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                  >
                    <option value="">All Roles</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="WORKER">WORKER</option>
                    <option value="TECHNICIAN">TECHNICIAN</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                      <tr>
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {paginatedUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-[#2B323D]/50">
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-white">{u.full_name}</p>
                            <p className="text-neutral-400 font-mono text-[11px]">
                              {u.employee_code} · {u.email}
                            </p>
                          </td>
                          <td className="py-2.5 px-4 text-neutral-300">{u.department_name || 'Plant-Wide'}</td>
                          <td className="py-2.5 px-4">
                            <select
                              value={u.role}
                              onChange={(e) => handleChangeRole(u.id, e.target.value)}
                              className="bg-[#171A21] border border-neutral-700 rounded px-2 py-1 text-xs font-mono text-white"
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="MANAGER">MANAGER</option>
                              <option value="WORKER">WORKER</option>
                              <option value="TECHNICIAN">TECHNICIAN</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={u.is_active ? 'text-[#22C55E] font-medium' : 'text-[#EF4444] font-medium'}>
                              {u.is_active ? 'Active' : 'Deactivated'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() => handleToggleUserStatus(u)}
                              className="text-xs font-medium text-[#FF8A32] hover:underline whitespace-nowrap"
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                  <span className="tabular-nums">
                    Showing {paginatedUsers.length} of {filteredUsers.length} accounts
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={userPage <= 1}
                      onClick={() => setUserPage((p) => p - 1)}
                      className="px-2.5 py-1 bg-[#171A21] border border-neutral-700 rounded disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="font-mono tabular-nums">
                      {userPage} / {totalUserPages}
                    </span>
                    <button
                      disabled={userPage >= totalUserPages}
                      onClick={() => setUserPage((p) => p + 1)}
                      className="px-2.5 py-1 bg-[#171A21] border border-neutral-700 rounded disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                <h3 className="text-base font-semibold text-[#F5F6F8] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#FF8A32]" />
                  Provision New Account
                </h3>
                <form onSubmit={handleCreateUser} className="space-y-3 mt-4">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newUser.fullName}
                      onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                      placeholder="Nikhil Kulkarni"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Employee ID</label>
                      <input
                        type="text"
                        required
                        value={newUser.employeeCode}
                        onChange={(e) => setNewUser({ ...newUser, employeeCode: e.target.value })}
                        placeholder="EMP-WRK-145"
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Role</label>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        <option value="WORKER">WORKER</option>
                        <option value="MANAGER">MANAGER</option>
                        <option value="TECHNICIAN">TECHNICIAN</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Work Email</label>
                    <input
                      type="email"
                      required
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="nikhil.k@factorypulse.demo"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Department</label>
                    <select
                      value={newUser.departmentId}
                      onChange={(e) => setNewUser({ ...newUser, departmentId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Initial Password (min 8 chars)</label>
                    <input
                      type="password"
                      minLength={8}
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="Defaults to plant seed password if empty"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 px-4 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f]"
                  >
                    Create Authorized Account
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: SKILLS & CERTIFICATIONS */}
          {activeTab === 'skills' && overview && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-neutral-800">
                    <h3 className="text-sm font-semibold text-[#F5F6F8]">Operational Skill Catalog</h3>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                      <tr>
                        <th className="py-2.5 px-4">Skill Code</th>
                        <th className="py-2.5 px-4">Name</th>
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4 text-right">Qualified Workers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {overview.skills.map((s: any) => (
                        <tr key={s.id}>
                          <td className="py-2.5 px-4 font-mono text-[#FF8A32]">{s.code}</td>
                          <td className="py-2.5 px-4 text-white">{s.name}</td>
                          <td className="py-2.5 px-4 text-neutral-400">{s.category}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">{s.qualified_workers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-neutral-800">
                    <h3 className="text-sm font-semibold text-[#F5F6F8]">Issued Worker Certifications</h3>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                        <tr>
                          <th className="py-2.5 px-4">Worker</th>
                          <th className="py-2.5 px-4">Certification</th>
                          <th className="py-2.5 px-4">Valid Until</th>
                          <th className="py-2.5 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800">
                        {overview.certifications.slice(0, 20).map((c: any) => (
                          <tr key={c.id}>
                            <td className="py-2 px-4 text-white">{c.worker_name}</td>
                            <td className="py-2 px-4 text-neutral-300">{c.name}</td>
                            <td className="py-2 px-4 font-mono tabular-nums text-neutral-400">{c.expiry_date}</td>
                            <td className="py-2 px-4 text-[#22C55E]">{c.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Add Skill Requirement</h3>
                  <form onSubmit={handleCreateSkill} className="space-y-3 mt-3">
                    <input
                      type="text"
                      required
                      value={newSkill.code}
                      onChange={(e) => setNewSkill({ ...newSkill, code: e.target.value })}
                      placeholder="Skill Code (e.g. LASER_CUTTING)"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    />
                    <input
                      type="text"
                      required
                      value={newSkill.name}
                      onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                      placeholder="Skill Title"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                    <button
                      type="submit"
                      className="w-full py-2 px-4 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md"
                    >
                      Register Skill
                    </button>
                  </form>
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Assign Worker Skill & Certification</h3>
                  <form onSubmit={handleGrantCert} className="space-y-3 mt-3">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Worker</label>
                      <select
                        value={newCert.workerId}
                        onChange={(e) => setNewCert({ ...newCert, workerId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        {workers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.full_name} ({w.employee_code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Pair with Skill (Optional)</label>
                      <select
                        value={newCert.skillId}
                        onChange={(e) => setNewCert({ ...newCert, skillId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        <option value="">None</option>
                        {overview.skills.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Certification Title</label>
                      <input
                        type="text"
                        required
                        value={newCert.name}
                        onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 px-4 text-xs font-semibold bg-[#19C6B4] text-[#171A21] rounded-md"
                    >
                      Grant Qualification
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: MACHINE REGISTRY */}
          {activeTab === 'machines' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-neutral-800">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Plant Machine Asset Registry</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                      <tr>
                        <th className="py-3 px-4">Asset Code</th>
                        <th className="py-3 px-4">Machine Name</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Required Skill</th>
                        <th className="py-3 px-4 text-right">Cap (u/hr)</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {machines.map((m) => (
                        <tr key={m.id} className="hover:bg-[#2B323D]/50">
                          <td className="py-2.5 px-4 font-mono text-[#FF8A32]">{m.machine_code}</td>
                          <td className="py-2.5 px-4 text-white font-medium">{m.name}</td>
                          <td className="py-2.5 px-4 text-neutral-300">{m.department_name}</td>
                          <td className="py-2.5 px-4 font-mono text-neutral-400">{m.required_skill_code}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">{m.capacity_units_per_hr}</td>
                          <td className="py-2.5 px-4 font-mono">
                            <span
                              className={
                                m.status === 'OPERATING'
                                  ? 'text-[#22C55E]'
                                  : m.status === 'FAULT'
                                  ? 'text-[#EF4444]'
                                  : m.status === 'MAINTENANCE'
                                  ? 'text-[#F59E0B]'
                                  : 'text-neutral-300'
                              }
                            >
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-4 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                <h3 className="text-base font-semibold text-[#F5F6F8]">Register Industrial Machine</h3>
                <form onSubmit={handleCreateMachine} className="space-y-3 mt-4">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Asset Code</label>
                    <input
                      type="text"
                      required
                      value={newMachine.machineCode}
                      onChange={(e) => setNewMachine({ ...newMachine, machineCode: e.target.value })}
                      placeholder="MCH-CNC-105"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Machine Name</label>
                    <input
                      type="text"
                      required
                      value={newMachine.name}
                      onChange={(e) => setNewMachine({ ...newMachine, name: e.target.value })}
                      placeholder="Haas VF-4SS Vertical Machining Center"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Department</label>
                      <select
                        value={newMachine.departmentId}
                        onChange={(e) => setNewMachine({ ...newMachine, departmentId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Capacity (u/hr)</label>
                      <input
                        type="number"
                        required
                        min={5}
                        value={newMachine.capacityUnitsPerHr}
                        onChange={(e) => setNewMachine({ ...newMachine, capacityUnitsPerHr: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Required Skill Code</label>
                    <select
                      value={newMachine.requiredSkillCode}
                      onChange={(e) => setNewMachine({ ...newMachine, requiredSkillCode: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    >
                      {overview?.skills?.map((s: any) => (
                        <option key={s.code} value={s.code}>{s.code}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">SOP Operating Instructions</label>
                    <textarea
                      rows={2}
                      value={newMachine.instructions}
                      onChange={(e) => setNewMachine({ ...newMachine, instructions: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 px-4 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md"
                  >
                    Add Machine to Registry
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 7: SYSTEM CONFIGURATION */}
          {activeTab === 'config' && (
            <div className="max-w-2xl bg-[#242A33] border border-neutral-800 rounded-lg p-6">
              <h3 className="text-base font-semibold text-[#F5F6F8]">Operational Thresholds & Plant Settings</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Configure production alert triggers and preventive maintenance reminder windows for {configState.name}.
              </p>
              <form onSubmit={handleSaveConfig} className="space-y-4 mt-5">
                <div>
                  <label className="block text-xs text-neutral-300 mb-1">Plant Operating Hours</label>
                  <input
                    type="text"
                    value={configState.operatingHours}
                    onChange={(e) => setConfigState({ ...configState, operatingHours: e.target.value })}
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">
                      Production Achievement Alert Threshold (%)
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      value={configState.alertThresholdPct}
                      onChange={(e) => setConfigState({ ...configState, alertThresholdPct: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">
                      Preventive Maintenance Reminder Lead (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={configState.maintReminderDays}
                      onChange={(e) => setConfigState({ ...configState, maintReminderDays: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm font-mono text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f]"
                >
                  Save Operational Configuration
                </button>
              </form>
            </div>
          )}

          {/* TAB 8: AUDIT LOGS */}
          {activeTab === 'audits' && (
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">System-Wide Audit Trail</h3>
                  <p className="text-xs text-neutral-400">Tracks logins, role changes, allocations, fault reports, and recovery approvals</p>
                </div>
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Filter action or user..."
                    className="w-full pl-9 pr-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Entity</th>
                      <th className="py-3 px-4">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {filteredAudits.map((a) => (
                      <tr key={a.id} className="hover:bg-[#2B323D]/40">
                        <td className="py-2.5 px-4 font-mono tabular-nums text-neutral-400 whitespace-nowrap">
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-white whitespace-nowrap">
                          {a.user_name} <span className="text-neutral-500">({a.role_name})</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[#FF8A32] whitespace-nowrap">{a.action}</td>
                        <td className="py-2.5 px-4 font-mono text-neutral-400 whitespace-nowrap">{a.entity_type}</td>
                        <td className="py-2.5 px-4 text-neutral-200">{a.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
};
