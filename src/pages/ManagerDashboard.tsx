import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Download,
  Printer,
  GitBranch,
  History,
  X,
  ShieldAlert,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { DashboardShell } from '../components/DashboardShell';
import { MANAGER_NAV_ITEMS } from './RecoveryEnginePage';
import { apiFetch, exportToCsv } from '../lib/api';
import { useToast } from '../context/ToastContext';

export const ManagerDashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();

  const activeTab = searchParams.get('tab') || 'overview';
  const handleSelectTab = (id: string) => {
    setSearchParams({ tab: id });
  };

  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [safetyIncidents, setSafetyIncidents] = useState<any[]>([]);
  const [maintData, setMaintData] = useState<{ requests: any[]; schedules: any[]; technicians: any[] }>({
    requests: [],
    schedules: [],
    technicians: [],
  });

  // Filters
  const [deptFilter, setDeptFilter] = useState('');
  const [workerSearch, setWorkerSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');

  // Machine History Modal
  const [historyModalMachine, setHistoryModalMachine] = useState<any>(null);
  const [machineHistoryData, setMachineHistoryData] = useState<{ statusLogs: any[]; maintenanceHistory: any[] } | null>(null);

  // Forms
  const [shiftForm, setShiftForm] = useState({
    departmentId: '',
    name: 'Morning',
    shiftDate: new Date().toISOString().slice(0, 10),
    requiredWorkers: 6,
  });
  const [assignShiftForm, setAssignShiftForm] = useState({
    shiftId: '',
    workerId: '',
  });

  const [orderForm, setOrderForm] = useState({
    departmentId: '',
    machineId: '',
    workerId: '',
    productName: '',
    targetQty: 250,
    priority: 'HIGH',
    deadline: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
  });

  const [outputLogForm, setOutputLogForm] = useState({
    orderId: '',
    outputDelta: 25,
    downtimeMins: 0,
    notes: '',
  });

  const [safetyActionForm, setSafetyActionForm] = useState({
    incidentId: '',
    assignedToId: '',
    actionPlan: '',
    deadline: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });

  const [maintScheduleForm, setMaintScheduleForm] = useState({
    machineId: '',
    technicianId: '',
    title: 'Preventive Spindle & Axis Calibration',
    scheduledDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    durationHrs: 2.5,
  });

  const loadManagerWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [an, dep, wrk, shf, mch, ord, saf, mnt] = await Promise.all([
        apiFetch(`/api/analytics/overview${deptFilter ? `?departmentId=${deptFilter}` : ''}`),
        apiFetch('/api/admin/departments'),
        apiFetch('/api/workers'),
        apiFetch('/api/shifts'),
        apiFetch('/api/machines'),
        apiFetch('/api/production/orders'),
        apiFetch('/api/safety/incidents'),
        apiFetch('/api/maintenance/requests'),
      ]);
      setAnalytics(an);
      setDepartments(dep.departments);
      setWorkers(wrk.workers);
      setShifts(shf.shifts);
      setMachines(mch.machines);
      setOrders(ord.orders);
      setSafetyIncidents(saf.incidents);
      setMaintData(mnt);

      if (dep.departments[0]) {
        const dId = dep.departments[0].id;
        setShiftForm((p) => ({ ...p, departmentId: p.departmentId || dId }));
        setOrderForm((p) => ({ ...p, departmentId: p.departmentId || dId }));
      }
      if (shf.shifts[0]) {
        setAssignShiftForm((p) => ({ ...p, shiftId: p.shiftId || shf.shifts[0].id }));
      }
      const availWrk = wrk.workers.find((w: any) => w.availability !== 'ABSENT') || wrk.workers[0];
      if (availWrk) {
        setAssignShiftForm((p) => ({ ...p, workerId: p.workerId || availWrk.id }));
        setOrderForm((p) => ({ ...p, workerId: p.workerId || availWrk.id }));
      }
      if (mch.machines[0]) {
        setOrderForm((p) => ({ ...p, machineId: p.machineId || mch.machines[0].id }));
        setMaintScheduleForm((p) => ({ ...p, machineId: p.machineId || mch.machines[0].id }));
      }
      if (ord.orders[0]) {
        setOutputLogForm((p) => ({ ...p, orderId: p.orderId || ord.orders[0].id }));
      }
      const openSaf = saf.incidents.find((s: any) => s.status !== 'RESOLVED');
      if (openSaf) {
        setSafetyActionForm((p) => ({ ...p, incidentId: p.incidentId || openSaf.id }));
      }
      if (mnt.technicians[0]) {
        setSafetyActionForm((p) => ({ ...p, assignedToId: p.assignedToId || mnt.technicians[0].id }));
        setMaintScheduleForm((p) => ({ ...p, technicianId: p.technicianId || mnt.technicians[0].id }));
      }
    } catch (err: any) {
      notify('error', 'Failed to load operational workspace', err.message);
    } finally {
      setLoading(false);
    }
  }, [deptFilter, notify]);

  useEffect(() => {
    loadManagerWorkspace();
  }, [loadManagerWorkspace]);

  const openMachineHistory = async (m: any) => {
    setHistoryModalMachine(m);
    try {
      const data = await apiFetch(`/api/machines/${m.id}/history`);
      setMachineHistoryData(data);
    } catch (err: any) {
      notify('error', 'Failed to load machine history', err.message);
    }
  };

  // Handlers
  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/shifts', {
        method: 'POST',
        body: JSON.stringify(shiftForm),
      });
      notify('success', 'Shift Created', res.message);
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Shift creation failed', err.message);
    }
  };

  const handleAssignWorkerToShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/shifts/assign', {
        method: 'POST',
        body: JSON.stringify(assignShiftForm),
      });
      notify('success', 'Shift Roster Updated', res.message);
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Scheduling Conflict Blocked', err.message);
    }
  };

  const handleMachineStatusChange = async (machineId: string, nextStatus: string) => {
    try {
      const res = await apiFetch(`/api/machines/${machineId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          reason: `Authorized operational workflow transition to ${nextStatus}`,
        }),
      });
      notify('success', 'Machine Status Updated', res.message);
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Status update failed', err.message);
    }
  };

  const handleCreateProductionOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/production/orders', {
        method: 'POST',
        body: JSON.stringify(orderForm),
      });
      notify('success', 'Production Order Dispatched', res.message);
      setOrderForm({ ...orderForm, productName: '' });
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Order creation error', err.message);
    }
  };

  const handleOrderStatusUpdate = async (orderId: string, status: string) => {
    try {
      await apiFetch(`/api/production/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify('success', 'Order Status Updated', `Transitioned order to ${status}.`);
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Order update error', err.message);
    }
  };

  const handleRecordOutput = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/production/logs', {
        method: 'POST',
        body: JSON.stringify(outputLogForm),
      });
      notify('success', 'Output Logged', res.message);
      setOutputLogForm({ ...outputLogForm, notes: '', downtimeMins: 0 });
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Log failed', err.message);
    }
  };

  const handleAssignSafetyAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!safetyActionForm.incidentId) return;
    try {
      const res = await apiFetch(`/api/safety/incidents/${safetyActionForm.incidentId}`, {
        method: 'PATCH',
        body: JSON.stringify(safetyActionForm),
      });
      notify('success', 'Corrective Action Assigned', res.message);
      setSafetyActionForm({ ...safetyActionForm, actionPlan: '' });
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Safety update failed', err.message);
    }
  };

  const handleResolveSafety = async (id: string) => {
    try {
      await apiFetch(`/api/safety/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      });
      notify('success', 'Safety Incident Closed', 'Resolution logged and reporter notified.');
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Resolution failed', err.message);
    }
  };

  const handleAssignTechnician = async (reqId: string, techId: string) => {
    if (!techId) return;
    try {
      await apiFetch(`/api/maintenance/requests/${reqId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedTechId: techId, status: 'ASSIGNED' }),
      });
      notify('success', 'Technician Dispatched', 'Maintenance technician notified.');
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Assignment failed', err.message);
    }
  };

  const handleConfirmMaintenance = async (reqId: string) => {
    try {
      const res = await apiFetch(`/api/maintenance/requests/${reqId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ restoreMachineStatus: 'IDLE' }),
      });
      notify('success', 'Maintenance Confirmed & Machine Restored', res.message);
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Confirmation failed', err.message);
    }
  };

  const handleSchedulePreventive = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/maintenance/schedules', {
        method: 'POST',
        body: JSON.stringify(maintScheduleForm),
      });
      notify('success', 'Preventive Maintenance Scheduled', res.message);
      loadManagerWorkspace();
    } catch (err: any) {
      notify('error', 'Schedule error', err.message);
    }
  };

  // Filtered Views
  const filteredWorkers = workers.filter((w) => {
    const matchDept = !deptFilter || w.department_id === deptFilter;
    const matchSkill = !skillFilter || w.skills.some((s: any) => s.code === skillFilter);
    const matchSearch =
      !workerSearch ||
      w.full_name.toLowerCase().includes(workerSearch.toLowerCase()) ||
      w.employee_code.toLowerCase().includes(workerSearch.toLowerCase());
    return matchDept && matchSkill && matchSearch;
  });

  const filteredOrders = orders.filter((o) => {
    const matchDept = !deptFilter || o.department_id === deptFilter;
    const matchStatus = !orderStatusFilter || o.status === orderStatusFilter;
    return matchDept && matchStatus;
  });

  const navMatch = MANAGER_NAV_ITEMS.find((n) => n.id === activeTab) || MANAGER_NAV_ITEMS[0];

  return (
    <DashboardShell
      roleTitle="Factory Manager"
      accentHex="#19C6B4"
      navItems={MANAGER_NAV_ITEMS}
      activeTab={activeTab}
      onSelectTab={handleSelectTab}
      pageTitle={navMatch.label}
      breadcrumbSub="Northstar Manufacturing Works · Connected Operations"
      headerActions={
        <div className="flex items-center gap-2">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="hidden sm:block px-2.5 py-1.5 bg-[#242A33] border border-neutral-700 rounded-md text-xs text-neutral-200"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button
            onClick={() => navigate('/manager/recovery-engine')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] whitespace-nowrap shrink-0"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Recovery Engine
          </button>
        </div>
      }
    >
      {loading && !analytics ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-28 bg-[#242A33] border border-neutral-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ================================================================ */}
          {/* 7.1 MANAGER OVERVIEW DASHBOARD                                   */}
          {/* ================================================================ */}
          {activeTab === 'overview' && analytics && (
            <div className="space-y-6">
              {/* 5 Domain KPI Clusters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
                  <p className="text-xs font-medium text-[#19C6B4]">Workforce Status</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                    {analytics.workforce.present} / {analytics.workforce.total}
                  </p>
                  <p className="text-xs text-neutral-400 mt-2 font-mono tabular-nums">
                    Avail {analytics.workforce.available} · Asgn {analytics.workforce.assigned} · Abs {analytics.workforce.absent}
                  </p>
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
                  <p className="text-xs font-medium text-[#19C6B4]">Machine Fleet</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                    {analytics.machines.operating} / {analytics.machines.total}
                  </p>
                  <p className="text-xs text-neutral-400 mt-2 font-mono tabular-nums">
                    Idle {analytics.machines.idle} · <span className="text-[#EF4444]">Fault {analytics.machines.fault}</span> · Maint {analytics.machines.maintenance}
                  </p>
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
                  <p className="text-xs font-medium text-[#FF8A32]">Production Achievement</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-[#FF8A32] mt-1">
                    {analytics.production.achievementPct}%
                  </p>
                  <p className="text-xs text-neutral-400 mt-2 font-mono tabular-nums">
                    Active {analytics.production.activeOrders} · Done {analytics.production.completedOrders} · Delay {analytics.production.delayedOrders}
                  </p>
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
                  <p className="text-xs font-medium text-[#EF4444]">Workplace Safety</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                    {analytics.safety.activeIncidents} Open
                  </p>
                  <p className="text-xs text-neutral-400 mt-2 font-mono tabular-nums">
                    High-Prio {analytics.safety.highPriority} · Actions {analytics.safety.pendingActions}
                  </p>
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
                  <p className="text-xs font-medium text-[#22C55E]">Maintenance Queue</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                    {analytics.maintenance.pendingRequests} Pending
                  </p>
                  <p className="text-xs text-neutral-400 mt-2 font-mono tabular-nums">
                    Sched {analytics.maintenance.scheduledCount} · <span className="text-[#F59E0B]">Overdue {analytics.maintenance.overdueCount}</span>
                  </p>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#F5F6F8]">Daily Production Output & Downtime Trend</h3>
                      <p className="text-xs text-neutral-400">Recorded shift production units vs. cumulative downtime minutes</p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.productionTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="date" stroke="#9CA3AF" fontSize={11} />
                        <YAxis stroke="#9CA3AF" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#171A21', borderColor: '#374151', fontSize: 12 }} />
                        <Area type="monotone" dataKey="output" name="Produced Units" stroke="#19C6B4" fill="#19C6B4" fillOpacity={0.2} />
                        <Area type="monotone" dataKey="downtime" name="Downtime (mins)" stroke="#FF8A32" fill="#FF8A32" fillOpacity={0.18} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8] mb-1">Department Utilization & Output Achievement</h3>
                  <p className="text-xs text-neutral-400 mb-4">Machine utilization % alongside order completion %</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.deptPerformance} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" domain={[0, 100]} stroke="#9CA3AF" fontSize={11} />
                        <YAxis dataKey="name" type="category" width={95} stroke="#9CA3AF" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#171A21', borderColor: '#374151', fontSize: 12 }} />
                        <Bar dataKey="avg_machine_util" name="Machine Util %" fill="#19C6B4" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="achievementPct" name="Order Achievement %" fill="#FF8A32" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Critical Alerts & Quick Recovery Escalation */}
              <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#F5F6F8]">Active Operational Alerts & Fault Escalations</h3>
                    <p className="text-xs text-neutral-400">Unresolved machine faults and workplace safety hazards requiring coordination</p>
                  </div>
                  <button
                    onClick={() => navigate('/manager/recovery-engine')}
                    className="text-xs font-semibold text-[#FF8A32] hover:underline"
                  >
                    Evaluate Faults in Recovery Engine →
                  </button>
                </div>
                <div className="divide-y divide-neutral-800">
                  {analytics.alerts.length === 0 ? (
                    <p className="py-4 text-xs text-neutral-400">Zero open critical alerts across departments.</p>
                  ) : (
                    analytics.alerts.map((al: any) => (
                      <div key={al.id} className="py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-semibold ${
                                al.severity === 'CRITICAL' || al.severity === 'HIGH' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                              }`}
                            >
                              {al.severity}
                            </span>
                            <span className="text-neutral-500">·</span>
                            <span className="font-mono text-neutral-300">{al.code}</span>
                            <span className="text-neutral-500">·</span>
                            <span className="font-semibold text-white">{al.title}</span>
                          </div>
                          <p className="text-neutral-400 mt-1">{al.description}</p>
                        </div>
                        <button
                          onClick={() =>
                            al.type === 'MACHINE_FAULT'
                              ? navigate('/manager/recovery-engine')
                              : handleSelectTab('safety')
                          }
                          className="px-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-xs text-neutral-200 hover:text-white shrink-0"
                        >
                          {al.type === 'MACHINE_FAULT' ? 'Recover Capacity' : 'Assign Action'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 7.2 WORKFORCE MANAGEMENT                                         */}
          {/* ================================================================ */}
          {activeTab === 'workforce' && (
            <div className="space-y-4">
              <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                    placeholder="Search worker name or employee ID..."
                    className="w-full pl-9 pr-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                  />
                </div>
                <div className="flex items-center gap-2.5">
                  <select
                    value={skillFilter}
                    onChange={(e) => setSkillFilter(e.target.value)}
                    className="px-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                  >
                    <option value="">All Skills</option>
                    <option value="CNC_MILLING">CNC_MILLING</option>
                    <option value="ROBOTIC_WELD">ROBOTIC_WELD</option>
                    <option value="PRECISION_ASSY">PRECISION_ASSY</option>
                    <option value="AUTO_PACK">AUTO_PACK</option>
                    <option value="CMM_METROLOGY">CMM_METROLOGY</option>
                    <option value="HYDRAULIC_PRESS">HYDRAULIC_PRESS</option>
                  </select>
                </div>
              </div>

              <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                      <tr>
                        <th className="py-3 px-4">Operator</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Verified Skills</th>
                        <th className="py-3 px-4">Certifications</th>
                        <th className="py-3 px-4">Attendance Today</th>
                        <th className="py-3 px-4">Assigned Machine</th>
                        <th className="py-3 px-4">Availability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {filteredWorkers.map((w) => (
                        <tr key={w.id} className="hover:bg-[#2B323D]/40">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-white">{w.full_name}</p>
                            <p className="text-[11px] font-mono text-neutral-400">
                              {w.employee_code} · {w.designation}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-neutral-300">{w.department_name}</td>
                          <td className="py-3 px-4 font-mono text-[11px] text-[#19C6B4]">
                            {w.skills.map((s: any) => `${s.code} (L${s.proficiency_level})`).join(' · ') || 'None'}
                          </td>
                          <td className="py-3 px-4 text-neutral-300">
                            {w.certifications.map((c: any) => c.name).join(' · ') || 'Standard Safety'}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-neutral-300">
                            {w.todayAttendance?.status === 'PRESENT'
                              ? `In ${w.todayAttendance.check_in_time}`
                              : w.todayAttendance?.status === 'CHECKED_OUT'
                              ? `Out (${w.todayAttendance.hours_worked}h)`
                              : 'Absent'}
                          </td>
                          <td className="py-3 px-4 font-mono text-neutral-300">
                            {w.assigned_machine_code || 'Standby Pool'}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <span
                              className={
                                w.availability === 'AVAILABLE'
                                  ? 'text-[#22C55E]'
                                  : w.availability === 'ASSIGNED'
                                  ? 'text-[#19C6B4]'
                                  : 'text-[#EF4444]'
                              }
                            >
                              {w.availability}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 7.3 SHIFT PLANNING (Indigo/Cyan Identity)                        */}
          {/* ================================================================ */}
          {activeTab === 'shifts' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-4">
                {shifts.map((s) => {
                  const filled = s.assignments.length;
                  const shortage = Math.max(0, s.required_workers - filled);
                  return (
                    <div key={s.id} className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-800">
                        <div>
                          <p className="text-sm font-semibold text-[#F5F6F8]">
                            {s.name} Shift ({s.start_time}–{s.end_time}) · {s.department_name}
                          </p>
                          <p className="text-xs font-mono text-neutral-400 mt-0.5">Date: {s.shift_date}</p>
                        </div>
                        <div className="text-xs font-mono tabular-nums">
                          <span className={shortage > 0 ? 'text-[#F59E0B]' : 'text-[#22C55E]'}>
                            Staffed {filled} / {s.required_workers}
                          </span>
                          {shortage > 0 && <span className="text-neutral-400"> · {shortage} open slot(s)</span>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-300">
                        {s.assignments.length === 0 ? (
                          <span className="text-neutral-500">No workers assigned to this shift yet.</span>
                        ) : (
                          s.assignments.map((a: any) => (
                            <span key={a.id} className="px-2.5 py-1 bg-[#171A21] border border-neutral-800 rounded">
                              {a.full_name} <span className="font-mono text-neutral-500">({a.employee_code})</span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="lg:col-span-4 space-y-6">
                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Create Shift Window</h3>
                  <form onSubmit={handleCreateShift} className="space-y-3 mt-3">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Department</label>
                      <select
                        value={shiftForm.departmentId}
                        onChange={(e) => setShiftForm({ ...shiftForm, departmentId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1">Shift Window</label>
                        <select
                          value={shiftForm.name}
                          onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                          className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                        >
                          <option value="Morning">Morning (06:00–14:00)</option>
                          <option value="Afternoon">Afternoon (14:00–22:00)</option>
                          <option value="Night">Night (22:00–06:00)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1">Required Staff</label>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={shiftForm.requiredWorkers}
                          onChange={(e) => setShiftForm({ ...shiftForm, requiredWorkers: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Shift Date</label>
                      <input
                        type="date"
                        value={shiftForm.shiftDate}
                        onChange={(e) => setShiftForm({ ...shiftForm, shiftDate: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 px-4 text-xs font-semibold bg-[#06B6D4] text-[#171A21] rounded-md hover:bg-cyan-300"
                    >
                      Schedule Shift
                    </button>
                  </form>
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Assign Worker (Conflict-Checked)</h3>
                  <form onSubmit={handleAssignWorkerToShift} className="space-y-3 mt-3">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Target Shift</label>
                      <select
                        value={assignShiftForm.shiftId}
                        onChange={(e) => setAssignShiftForm({ ...assignShiftForm, shiftId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        {shifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.shift_date} · {s.name} · {s.department_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Eligible Available Worker</label>
                      <select
                        value={assignShiftForm.workerId}
                        onChange={(e) => setAssignShiftForm({ ...assignShiftForm, workerId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        {workers
                          .filter((w) => w.availability !== 'ABSENT')
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.full_name} ({w.employee_code} · {w.department_name})
                            </option>
                          ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 px-4 text-xs font-semibold bg-[#19C6B4] text-[#171A21] rounded-md"
                    >
                      Assign Worker to Shift
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 7.4 MACHINE MANAGEMENT                                           */}
          {/* ================================================================ */}
          {activeTab === 'machines' && (
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Plant Machine Operations & Status Control</h3>
                  <p className="text-xs text-neutral-400">Every status transition records an immutable machine status log</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="py-3 px-4">Machine</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4 text-right">Util %</th>
                      <th className="py-3 px-4">Assigned Operators</th>
                      <th className="py-3 px-4">Active Order</th>
                      <th className="py-3 px-4">Operational Status</th>
                      <th className="py-3 px-4 text-right">History</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {machines.map((m) => (
                      <tr key={m.id} className="hover:bg-[#2B323D]/40">
                        <td className="py-3 px-4">
                          <p className="font-mono font-semibold text-[#19C6B4]">{m.machine_code}</p>
                          <p className="text-white">{m.name}</p>
                        </td>
                        <td className="py-3 px-4 text-neutral-300">{m.department_name}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{m.utilization_pct}%</td>
                        <td className="py-3 px-4 text-neutral-300">
                          {m.assignedWorkers?.map((w: any) => w.full_name).join(', ') || 'Unassigned'}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-300">
                          {m.activeOrders?.map((o: any) => o.order_code).join(', ') || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={m.status}
                            onChange={(e) => handleMachineStatusChange(m.id, e.target.value)}
                            className="bg-[#171A21] border border-neutral-700 rounded px-2 py-1 text-xs font-mono text-white"
                          >
                            <option value="OPERATING">OPERATING</option>
                            <option value="IDLE">IDLE</option>
                            <option value="FAULT">FAULT</option>
                            <option value="MAINTENANCE">MAINTENANCE</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => openMachineHistory(m)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#FF8A32] hover:underline"
                          >
                            <History className="w-3.5 h-3.5" />
                            Logs
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 7.5 PRODUCTION MANAGEMENT                                        */}
          {/* ================================================================ */}
          {activeTab === 'production' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#F5F6F8]">Production Orders</h3>
                    <select
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                      className="px-2.5 py-1 bg-[#171A21] border border-neutral-700 rounded text-xs text-white"
                    >
                      <option value="">All Statuses</option>
                      <option value="NOT_STARTED">NOT_STARTED</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="DELAYED">DELAYED</option>
                      <option value="ON_HOLD">ON_HOLD</option>
                      <option value="COMPLETED">COMPLETED</option>
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                        <tr>
                          <th className="py-2.5 px-4">Order</th>
                          <th className="py-2.5 px-4">Machine</th>
                          <th className="py-2.5 px-4 text-right">Progress</th>
                          <th className="py-2.5 px-4">Priority</th>
                          <th className="py-2.5 px-4">Due</th>
                          <th className="py-2.5 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800">
                        {filteredOrders.map((o) => {
                          const pct = Math.min(100, Math.round((o.produced_qty / Math.max(1, o.target_qty)) * 100));
                          return (
                            <tr key={o.id} className="hover:bg-[#2B323D]/40">
                              <td className="py-3 px-4">
                                <p className="font-mono font-semibold text-[#FF8A32]">{o.order_code}</p>
                                <p className="text-white">{o.product_name}</p>
                              </td>
                              <td className="py-3 px-4 font-mono text-neutral-300">{o.machine_code || 'Unassigned'}</td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                <span className="text-white">{o.produced_qty}/{o.target_qty}</span>{' '}
                                <span className="text-neutral-400">({pct}%)</span>
                              </td>
                              <td className="py-3 px-4 font-mono">{o.priority}</td>
                              <td className="py-3 px-4 font-mono tabular-nums text-neutral-400">{o.deadline}</td>
                              <td className="py-3 px-4">
                                <select
                                  value={o.status}
                                  onChange={(e) => handleOrderStatusUpdate(o.id, e.target.value)}
                                  className="bg-[#171A21] border border-neutral-700 rounded px-2 py-1 text-xs font-mono text-white"
                                >
                                  <option value="NOT_STARTED">NOT_STARTED</option>
                                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                                  <option value="DELAYED">DELAYED</option>
                                  <option value="ON_HOLD">ON_HOLD</option>
                                  <option value="COMPLETED">COMPLETED</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                  {/* Create Production Order */}
                  <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                    <h3 className="text-sm font-semibold text-[#F5F6F8]">Create Production Order</h3>
                    <form onSubmit={handleCreateProductionOrder} className="space-y-3 mt-3">
                      <input
                        type="text"
                        required
                        value={orderForm.productName}
                        onChange={(e) => setOrderForm({ ...orderForm, productName: e.target.value })}
                        placeholder="Product / Component Batch Name"
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      />
                      <div className="grid grid-cols-2 gap-2.5">
                        <select
                          value={orderForm.departmentId}
                          onChange={(e) => setOrderForm({ ...orderForm, departmentId: e.target.value })}
                          className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                        >
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <select
                          value={orderForm.priority}
                          onChange={(e) => setOrderForm({ ...orderForm, priority: e.target.value })}
                          className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                        >
                          <option value="CRITICAL">CRITICAL</option>
                          <option value="HIGH">HIGH</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="LOW">LOW</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <input
                          type="number"
                          required
                          min={10}
                          value={orderForm.targetQty}
                          onChange={(e) => setOrderForm({ ...orderForm, targetQty: Number(e.target.value) })}
                          placeholder="Target Qty"
                          className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                        />
                        <input
                          type="date"
                          required
                          value={orderForm.deadline}
                          onChange={(e) => setOrderForm({ ...orderForm, deadline: e.target.value })}
                          className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                        />
                      </div>
                      <select
                        value={orderForm.machineId}
                        onChange={(e) => setOrderForm({ ...orderForm, machineId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                      >
                        {machines
                          .filter((m) => m.status !== 'FAULT')
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.machine_code} — {m.name}
                            </option>
                          ))}
                      </select>
                      <select
                        value={orderForm.workerId}
                        onChange={(e) => setOrderForm({ ...orderForm, workerId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        {workers
                          .filter((w) => w.availability !== 'ABSENT')
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.full_name} ({w.employee_code})
                            </option>
                          ))}
                      </select>
                      <button
                        type="submit"
                        className="w-full py-2 px-4 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md"
                      >
                        Dispatch Production Order
                      </button>
                    </form>
                  </div>

                  {/* Record Shift Output / Downtime */}
                  <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                    <h3 className="text-sm font-semibold text-[#F5F6F8]">Record Production Output / Downtime</h3>
                    <form onSubmit={handleRecordOutput} className="space-y-3 mt-3">
                      <select
                        value={outputLogForm.orderId}
                        onChange={(e) => setOutputLogForm({ ...outputLogForm, orderId: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        {orders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.order_code} — {o.product_name}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-neutral-400 mb-1">Units Produced (+)</label>
                          <input
                            type="number"
                            min={0}
                            value={outputLogForm.outputDelta}
                            onChange={(e) => setOutputLogForm({ ...outputLogForm, outputDelta: Number(e.target.value) })}
                            className="w-full px-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-neutral-400 mb-1">Downtime (mins)</label>
                          <input
                            type="number"
                            min={0}
                            value={outputLogForm.downtimeMins}
                            onChange={(e) => setOutputLogForm({ ...outputLogForm, downtimeMins: Number(e.target.value) })}
                            className="w-full px-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-xs font-mono text-white"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 px-4 text-xs font-semibold bg-[#19C6B4] text-[#171A21] rounded-md"
                      >
                        Log Output & Sync
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 7.6 COMBINED SAFETY & MAINTENANCE MANAGEMENT                      */}
          {/* ================================================================ */}
          {(activeTab === 'safety-maintenance' || activeTab === 'safety' || activeTab === 'maintenance') && (
            <div className="space-y-8">
              {/* Safety Management Section */}
              <div className="bg-[#1C212B] border border-[#991B1B]/50 rounded-lg p-5">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#F59E0B]" />
                    Workplace Safety & Hazard Management
                  </h3>
                  <span className="text-xs font-mono text-[#F59E0B] px-2 py-0.5 bg-[#F59E0B]/15 rounded">
                    {safetyIncidents.filter((s) => s.status !== 'RESOLVED').length} Active Incidents
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-8 space-y-4">
                    {safetyIncidents.map((inc) => (
                  <div key={inc.id} className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#EF4444]">{inc.incident_code}</span>
                        <span>·</span>
                        <span className="font-semibold text-white">{inc.category}</span>
                        <span>·</span>
                        <span className="font-mono text-neutral-400">{inc.severity}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-mono text-neutral-300">{inc.status}</span>
                        {inc.status !== 'RESOLVED' && (
                          <button
                            onClick={() => handleResolveSafety(inc.id)}
                            className="px-2.5 py-1 bg-[#22C55E] text-[#171A21] font-semibold rounded"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-neutral-200 mt-2 leading-relaxed">{inc.description}</p>
                    <p className="text-[11px] text-neutral-400 mt-2">
                      Department: {inc.department_name} · Reported by {inc.reported_by_name}
                    </p>
                    {inc.actions?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1.5 text-xs">
                        {inc.actions.map((act: any) => (
                          <p key={act.id} className="text-neutral-300">
                            <span className="text-[#19C6B4] font-medium">Corrective Plan:</span> {act.action_plan} — Assigned to{' '}
                            <span className="text-white">{act.assigned_to_name}</span> (Due {act.deadline})
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="lg:col-span-4 bg-[#242A33] border border-neutral-800 rounded-lg p-5 h-fit">
                <h3 className="text-sm font-semibold text-[#F5F6F8]">Assign Corrective Safety Action</h3>
                <form onSubmit={handleAssignSafetyAction} className="space-y-3 mt-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Open Incident / Hazard</label>
                    <select
                      value={safetyActionForm.incidentId}
                      onChange={(e) => setSafetyActionForm({ ...safetyActionForm, incidentId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    >
                      {safetyIncidents
                        .filter((s) => s.status !== 'RESOLVED')
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.incident_code} — {s.category}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Responsible Personnel</label>
                    <select
                      value={safetyActionForm.assignedToId}
                      onChange={(e) => setSafetyActionForm({ ...safetyActionForm, assignedToId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    >
                      {maintData.technicians.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} ({t.employee_code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Corrective Action Plan</label>
                    <textarea
                      rows={3}
                      required
                      value={safetyActionForm.actionPlan}
                      onChange={(e) => setSafetyActionForm({ ...safetyActionForm, actionPlan: e.target.value })}
                      placeholder="Specify lockout check, spill containment, or hardware fix..."
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Resolution Deadline</label>
                    <input
                      type="date"
                      required
                      value={safetyActionForm.deadline}
                      onChange={(e) => setSafetyActionForm({ ...safetyActionForm, deadline: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 px-4 text-xs font-semibold bg-[#EF4444] text-white rounded-md hover:bg-red-500"
                  >
                    Assign Corrective Action
                  </button>
                </form>
              </div>
            </div>
          </div>

            {/* Maintenance Management Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
              <div className="lg:col-span-8 bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-neutral-800">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Machine Fault & Maintenance Requests</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                      <tr>
                        <th className="py-3 px-4">Request</th>
                        <th className="py-3 px-4">Machine</th>
                        <th className="py-3 px-4">Priority</th>
                        <th className="py-3 px-4">Technician</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Manager Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {maintData.requests.map((mr) => (
                        <tr key={mr.id} className="hover:bg-[#2B323D]/40">
                          <td className="py-3 px-4">
                            <p className="font-mono font-semibold text-[#22C55E]">{mr.request_code}</p>
                            <p className="text-white">{mr.fault_category}</p>
                          </td>
                          <td className="py-3 px-4 font-mono text-neutral-300">{mr.machine_code}</td>
                          <td className="py-3 px-4 font-mono text-[#FF8A32]">{mr.priority}</td>
                          <td className="py-3 px-4">
                            {mr.status !== 'COMPLETED' ? (
                              <select
                                value={mr.assigned_tech_id || ''}
                                onChange={(e) => handleAssignTechnician(mr.id, e.target.value)}
                                className="bg-[#171A21] border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                              >
                                <option value="">Assign Technician...</option>
                                {maintData.technicians.map((t) => (
                                  <option key={t.id} value={t.id}>{t.full_name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-neutral-300">{mr.assigned_tech_name || 'Completed'}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-neutral-300">{mr.status}</td>
                          <td className="py-3 px-4 text-right">
                            {mr.status !== 'COMPLETED' ? (
                              <button
                                onClick={() => handleConfirmMaintenance(mr.id)}
                                className="text-xs font-semibold text-[#19C6B4] hover:underline whitespace-nowrap"
                              >
                                Approve & Restore Bay
                              </button>
                            ) : (
                              <span className="text-neutral-500">Closed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-4 bg-[#242A33] border border-neutral-800 rounded-lg p-5 h-fit">
                <h3 className="text-sm font-semibold text-[#F5F6F8]">Schedule Preventive Maintenance</h3>
                <form onSubmit={handleSchedulePreventive} className="space-y-3 mt-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Machine Asset</label>
                    <select
                      value={maintScheduleForm.machineId}
                      onChange={(e) => setMaintScheduleForm({ ...maintScheduleForm, machineId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    >
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.machine_code} — {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Assigned Technician</label>
                    <select
                      value={maintScheduleForm.technicianId}
                      onChange={(e) => setMaintScheduleForm({ ...maintScheduleForm, technicianId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    >
                      {maintData.technicians.map((t) => (
                        <option key={t.id} value={t.id}>{t.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Service Scope Title</label>
                    <input
                      type="text"
                      required
                      value={maintScheduleForm.title}
                      onChange={(e) => setMaintScheduleForm({ ...maintScheduleForm, title: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="date"
                      required
                      value={maintScheduleForm.scheduledDate}
                      onChange={(e) => setMaintScheduleForm({ ...maintScheduleForm, scheduledDate: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    />
                    <input
                      type="number"
                      step="0.5"
                      min={0.5}
                      value={maintScheduleForm.durationHrs}
                      onChange={(e) => setMaintScheduleForm({ ...maintScheduleForm, durationHrs: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 px-4 text-xs font-semibold bg-[#22C55E] text-[#171A21] rounded-md"
                  >
                    Schedule Service Window
                  </button>
                </form>
              </div>
            </div>
          </div>
          )}

          {/* ================================================================ */}
          {/* 7.8 FACTORY ANALYTICS & EXPORTABLE REPORTS                       */}
          {/* ================================================================ */}
          {activeTab === 'analytics' && analytics && (
            <div className="space-y-6">
              <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Comprehensive Plant Performance Analytics</h3>
                  <p className="text-xs text-neutral-400">Export verified database records to CSV or print formatted shift reports</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => exportToCsv('factorypulse_production_orders.csv', orders)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#19C6B4] text-[#171A21] rounded-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Production CSV
                  </button>
                  <button
                    onClick={() => exportToCsv('factorypulse_machine_utilization.csv', machines)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#171A21] border border-neutral-700 text-neutral-200 rounded-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Machines CSV
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#171A21] border border-neutral-700 text-neutral-200 rounded-md"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Report
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-[#F5F6F8] mb-3">Workforce Skill Qualification Coverage</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.skillDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="code" stroke="#9CA3AF" fontSize={10} />
                        <YAxis stroke="#9CA3AF" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#171A21', borderColor: '#374151', fontSize: 12 }} />
                        <Bar dataKey="worker_count" name="Certified Workers" fill="#19C6B4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-[#F5F6F8] mb-3">Machine Operating vs. Idle & Fault Hours</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={machines.slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="machine_code" stroke="#9CA3AF" fontSize={10} />
                        <YAxis stroke="#9CA3AF" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#171A21', borderColor: '#374151', fontSize: 12 }} />
                        <Bar dataKey="operating_hours_total" name="Operating Hrs" stackId="a" fill="#22C55E" />
                        <Bar dataKey="idle_hours_total" name="Idle Hrs" stackId="a" fill="#6B7280" />
                        <Bar dataKey="fault_hours_total" name="Fault Hrs" stackId="a" fill="#EF4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Machine History Modal */}
      {historyModalMachine && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#242A33] border border-neutral-700 rounded-lg max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-700">
              <div>
                <h3 className="text-base font-semibold text-[#F5F6F8]">
                  {historyModalMachine.machine_code} — {historyModalMachine.name}
                </h3>
                <p className="text-xs text-neutral-400">Status Transition & Maintenance Service History</p>
              </div>
              <button onClick={() => setHistoryModalMachine(null)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <h4 className="font-semibold text-[#19C6B4] mb-2">Status Change Logs</h4>
                {machineHistoryData?.statusLogs.length ? (
                  <div className="divide-y divide-neutral-800 border border-neutral-800 rounded bg-[#171A21]">
                    {machineHistoryData.statusLogs.map((l: any) => (
                      <div key={l.id} className="p-3">
                        <p className="font-mono text-white">
                          {l.previous_status} → {l.new_status} · <span className="text-neutral-400">{new Date(l.created_at).toLocaleString()}</span>
                        </p>
                        <p className="text-neutral-300 mt-0.5">{l.reason} (by {l.changed_by_name})</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-400">No status changes recorded yet.</p>
                )}
              </div>

              <div>
                <h4 className="font-semibold text-[#FF8A32] mb-2">Maintenance & Fault History</h4>
                {machineHistoryData?.maintenanceHistory.length ? (
                  <div className="divide-y divide-neutral-800 border border-neutral-800 rounded bg-[#171A21]">
                    {machineHistoryData.maintenanceHistory.map((m: any) => (
                      <div key={m.id} className="p-3">
                        <p className="font-mono text-white">
                          {m.request_code} · {m.fault_category} [{m.status}]
                        </p>
                        <p className="text-neutral-300 mt-0.5">{m.description}</p>
                        {m.repair_notes && <p className="text-neutral-400 mt-1">Repair: {m.repair_notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-400">No maintenance tickets logged for this machine.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
