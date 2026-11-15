import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Clock,
  CalendarClock,
  ClipboardCheck,
  Cpu,
  AlertTriangle,
  ShieldAlert,
  UserCheck,
  CheckSquare,
  Repeat,
} from 'lucide-react';
import { DashboardShell, NavItem } from '../components/DashboardShell';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';

const WORKER_NAV: NavItem[] = [
  { id: 'shifts', label: '1. My Shift', icon: CalendarClock, group: 'Floor Terminal' },
  { id: 'tasks', label: '2. My Tasks', icon: ClipboardCheck, group: 'Floor Terminal' },
  { id: 'report', label: '3. Report an Issue', icon: AlertTriangle, group: 'Floor Terminal' },
];

export const WorkerDashboard: React.FC = () => {
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // Task progress form per task
  const [progressDeltas, setProgressDeltas] = useState<Record<string, number>>({});

  // Machine Fault Report form
  const [faultForm, setFaultForm] = useState({
    machineId: '',
    faultCategory: 'Servo / Spindle Overload',
    priority: 'HIGH',
    description: '',
  });

  // Safety Incident Report form
  const [safetyForm, setSafetyForm] = useState({
    incidentType: 'HAZARD',
    category: 'Machine Guarding / Interlock',
    severity: 'HIGH',
    description: '',
  });

  // Quality Inspection state
  const [qualityForm, setQualityForm] = useState({
    orderId: '',
    taskId: '',
    inspectedQty: 50,
    acceptedQty: 48,
    rejectedQty: 2,
    rejectionCategory: 'DIMENSIONAL_DEFECT',
    notes: '',
  });
  const [qualityInspections, setQualityInspections] = useState<any[]>([]);
  const [submittingQuality, setSubmittingQuality] = useState(false);

  const loadQualityInspections = useCallback(async () => {
    try {
      const res = await apiFetch<any>('/api/quality/inspections');
      setQualityInspections(res.inspections || []);
    } catch {
      // quiet
    }
  }, []);

  const handleQualitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qualityForm.acceptedQty + qualityForm.rejectedQty !== qualityForm.inspectedQty) {
      notify('error', 'Formula Error', `Accepted (${qualityForm.acceptedQty}) + Rejected (${qualityForm.rejectedQty}) must equal Inspected (${qualityForm.inspectedQty}).`);
      return;
    }
    setSubmittingQuality(true);
    try {
      const res = await apiFetch<any>('/api/quality/inspections', {
        method: 'POST',
        body: JSON.stringify(qualityForm),
      });
      notify('success', 'Quality Logged', `Inspection ${res.inspectionCode} saved. Yield: ${res.qualityRate}%`);
      loadQualityInspections();
    } catch (err: any) {
      notify('error', 'Inspection Error', err.message);
    } finally {
      setSubmittingQuality(false);
    }
  };

  const loadWorkerData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/worker/me');
      setData(res);
      if (res.worker?.machine_id) {
        setFaultForm((p) => ({ ...p, machineId: p.machineId || res.worker.machine_id }));
      } else if (res.allMachines?.[0]) {
        setFaultForm((p) => ({ ...p, machineId: p.machineId || res.allMachines[0].id }));
      }
    } catch (err: any) {
      notify('error', 'Failed to load worker portal', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadWorkerData();
    loadQualityInspections();
  }, [loadWorkerData, loadQualityInspections]);

  const handleCheckIn = async () => {
    try {
      const res = await apiFetch('/api/attendance/check-in', { method: 'POST' });
      notify('success', 'Shift Check-In Verified', res.message);
      loadWorkerData();
    } catch (err: any) {
      notify('error', 'Check-in Validation', err.message);
    }
  };

  const handleCheckOut = async () => {
    try {
      const res = await apiFetch('/api/attendance/check-out', { method: 'POST' });
      notify('success', 'Shift Check-Out Verified', res.message);
      loadWorkerData();
    } catch (err: any) {
      notify('error', 'Check-out Validation', err.message);
    }
  };

  const handleSubmitTaskProgress = async (task: any, markCompleted = false) => {
    const delta = markCompleted
      ? Math.max(0, task.target_qty - task.completed_qty)
      : Number(progressDeltas[task.id] || 15);
    try {
      const res = await apiFetch('/api/production/logs', {
        method: 'POST',
        body: JSON.stringify({
          taskId: task.id,
          orderId: task.order_id,
          outputDelta: delta,
          markCompleted,
          notes: `Operator task submission from ${data.worker.full_name}`,
        }),
      });
      notify('success', 'Task Progress Synced to Manager', res.message);
      loadWorkerData();
    } catch (err: any) {
      notify('error', 'Task update failed', err.message);
    }
  };

  const handleReportMachineFault = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/maintenance/requests', {
        method: 'POST',
        body: JSON.stringify(faultForm),
      });
      notify('success', 'Machine Fault Escalated', res.message);
      setFaultForm({ ...faultForm, description: '' });
      loadWorkerData();
    } catch (err: any) {
      notify('error', 'Fault submission failed', err.message);
    }
  };

  const handleReportSafety = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/safety/incidents', {
        method: 'POST',
        body: JSON.stringify(safetyForm),
      });
      notify('success', 'Safety Report Logged', res.message);
      setSafetyForm({ ...safetyForm, description: '' });
      loadWorkerData();
    } catch (err: any) {
      notify('error', 'Safety report failed', err.message);
    }
  };

  const currentNav = WORKER_NAV.find((n) => n.id === activeTab) || WORKER_NAV[0];
  const today = new Date().toISOString().slice(0, 10);
  const todayAtt = data?.attendance?.find((a: any) => a.attendance_date === today);
  const currentShift = data?.shifts?.[0];
  const activeTask = data?.tasks?.find((t: any) => t.status !== 'COMPLETED') || data?.tasks?.[0];

  return (
    <DashboardShell
      roleTitle="Floor Operator"
      accentHex="#C084FC"
      navItems={WORKER_NAV}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      pageTitle={currentNav.label}
      breadcrumbSub={data ? `${data.worker.department_name} Department · ${data.worker.employee_code}` : 'Operator Terminal'}
      headerActions={
        <button
          onClick={() => setActiveTab('fault')}
          className="px-3 py-1.5 text-xs font-semibold bg-[#EC4899] text-white rounded-md hover:bg-pink-500 transition-colors whitespace-nowrap shrink-0"
        >
          Report Machine Fault
        </button>
      }
    >
      {loading || !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-32 bg-[#242A33] border border-neutral-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* 8.1 WORKER OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-[#E879F9]">
                    Operator Terminal · {data.worker.employee_code} · {data.worker.department_name}
                  </p>
                  <h2 className="text-xl font-bold text-[#F5F6F8] mt-1">
                    Welcome on shift, {data.worker.full_name}
                  </h2>
                  <p className="text-xs text-neutral-300 mt-1">{data.worker.designation}</p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={handleCheckIn}
                    disabled={todayAtt?.status === 'PRESENT'}
                    className="px-4 py-2 text-xs font-semibold bg-[#C084FC] text-[#171A21] rounded-md hover:bg-purple-300 disabled:opacity-40"
                  >
                    {todayAtt?.status === 'PRESENT' ? `Checked In (${todayAtt.check_in_time})` : 'Shift Check-In'}
                  </button>
                  <button
                    onClick={handleCheckOut}
                    disabled={!todayAtt || todayAtt.status !== 'PRESENT'}
                    className="px-4 py-2 text-xs font-medium bg-[#171A21] border border-neutral-700 text-neutral-200 rounded-md hover:bg-neutral-800 disabled:opacity-40"
                  >
                    Check-Out
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <p className="text-xs text-neutral-400">Current Shift Assignment</p>
                  {currentShift ? (
                    <>
                      <p className="text-lg font-bold text-white mt-1">
                        {currentShift.name} Shift ({currentShift.start_time}–{currentShift.end_time})
                      </p>
                      <p className="text-xs text-neutral-400 mt-1 font-mono">
                        {currentShift.shift_date} · {currentShift.department_name}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-300 mt-2">No shift scheduled today.</p>
                  )}
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <p className="text-xs text-neutral-400">Assigned Machine Bay</p>
                  {data.worker.machine_code ? (
                    <>
                      <p className="text-lg font-bold font-mono text-[#E879F9] mt-1">{data.worker.machine_code}</p>
                      <p className="text-xs text-white mt-0.5">{data.worker.machine_name}</p>
                      <p className="text-xs font-mono text-neutral-400 mt-1">Status: {data.worker.machine_status}</p>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-300 mt-2">Standby pool (awaiting dispatch)</p>
                  )}
                </div>

                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <p className="text-xs text-neutral-400">Active Production Task</p>
                  {activeTask ? (
                    <>
                      <p className="text-sm font-semibold text-white mt-1 truncate">{activeTask.title}</p>
                      <p className="text-xs font-mono tabular-nums text-[#C084FC] mt-1">
                        Completed: {activeTask.completed_qty} / {activeTask.target_qty} units
                      </p>
                      <button
                        onClick={() => setActiveTab('tasks')}
                        className="mt-2 text-xs text-neutral-300 underline hover:text-white"
                      >
                        Submit batch output →
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-300 mt-2">All assigned tasks completed.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 8.3 ATTENDANCE */}
          {activeTab === 'attendance' && (
            <div className="space-y-5">
              <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Daily Attendance Verification</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Backend validation prevents duplicate check-ins or invalid check-outs.
                  </p>
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={handleCheckIn}
                    className="px-4 py-2 text-xs font-semibold bg-[#C084FC] text-[#171A21] rounded-md"
                  >
                    Record Check-In
                  </button>
                  <button
                    onClick={handleCheckOut}
                    className="px-4 py-2 text-xs font-semibold bg-[#171A21] border border-neutral-700 text-white rounded-md"
                  >
                    Record Check-Out
                  </button>
                </div>
              </div>

              <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Check-In</th>
                      <th className="py-3 px-4">Check-Out</th>
                      <th className="py-3 px-4 text-right">Hours Worked</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 font-mono tabular-nums">
                    {data.attendance.map((a: any) => (
                      <tr key={a.id}>
                        <td className="py-2.5 px-4 text-white">{a.attendance_date}</td>
                        <td className="py-2.5 px-4 text-neutral-300">{a.check_in_time || '—'}</td>
                        <td className="py-2.5 px-4 text-neutral-300">{a.check_out_time || 'Active'}</td>
                        <td className="py-2.5 px-4 text-right text-neutral-200">{a.hours_worked}h</td>
                        <td className="py-2.5 px-4 text-[#C084FC]">{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8.4 MY SHIFTS */}
          {activeTab === 'shifts' && (
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-neutral-800">
                <h3 className="text-sm font-semibold text-[#F5F6F8]">Assigned Shift Roster (Read-Only)</h3>
                <p className="text-xs text-neutral-400">Contact your Factory Manager for shift swap requests</p>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Shift</th>
                    <th className="py-3 px-4">Timing</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {data.shifts.map((s: any) => (
                    <tr key={s.assignment_id}>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-white">{s.shift_date}</td>
                      <td className="py-2.5 px-4 font-semibold text-[#E879F9]">{s.name}</td>
                      <td className="py-2.5 px-4 font-mono text-neutral-300">
                        {s.start_time} – {s.end_time}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-300">{s.department_name}</td>
                      <td className="py-2.5 px-4 font-mono text-[#22C55E]">{s.assignment_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 8.5 MY PRODUCTION TASKS */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              {data.tasks.length === 0 ? (
                <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-8 text-center text-xs text-neutral-400">
                  No production tasks currently assigned to your terminal.
                </div>
              ) : (
                data.tasks.map((t: any) => {
                  const pct = Math.min(100, Math.round((t.completed_qty / Math.max(1, t.target_qty)) * 100));
                  return (
                    <div key={t.id} className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-mono text-[#E879F9]">
                            {t.order_code} · Machine {t.machine_code} ({t.machine_status}) · Due {t.deadline}
                          </p>
                          <h3 className="text-base font-semibold text-white mt-0.5">{t.title}</h3>
                        </div>
                        <span className="text-xs font-mono px-2.5 py-1 bg-[#171A21] border border-neutral-700 rounded text-neutral-200">
                          {t.status}
                        </span>
                      </div>

                      <div className="mt-4">
                        <div className="flex justify-between text-xs font-mono tabular-nums mb-1">
                          <span className="text-neutral-400">Batch Progress</span>
                          <span className="text-white">
                            {t.completed_qty} / {t.target_qty} units ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-[#171A21] rounded overflow-hidden">
                          <div className="h-full bg-[#C084FC]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      {t.status !== 'COMPLETED' && (
                        <div className="mt-4 pt-3 border-t border-neutral-800 flex flex-wrap items-center gap-3">
                          <input
                            type="number"
                            min={1}
                            max={t.target_qty}
                            value={progressDeltas[t.id] ?? 15}
                            onChange={(e) =>
                              setProgressDeltas((p) => ({ ...p, [t.id]: Number(e.target.value) }))
                            }
                            className="w-28 px-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-xs font-mono text-white"
                          />
                          <button
                            onClick={() => handleSubmitTaskProgress(t, false)}
                            className="px-3.5 py-1.5 text-xs font-semibold bg-[#C084FC] text-[#171A21] rounded hover:bg-purple-300"
                          >
                            Log Completed Units
                          </button>
                          <button
                            onClick={() => handleSubmitTaskProgress(t, true)}
                            className="px-3.5 py-1.5 text-xs font-medium bg-[#171A21] border border-neutral-700 text-[#22C55E] rounded hover:bg-neutral-800"
                          >
                            Mark Task Completed
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 8.6 MACHINE INFORMATION */}
          {activeTab === 'machine' && (
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 max-w-2xl">
              <p className="text-xs font-mono text-[#E879F9]">ASSIGNED ASSET OPERATING INSTRUCTIONS</p>
              {data.worker.machine_code ? (
                <div className="mt-3 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {data.worker.machine_code} — {data.worker.machine_name}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Type: {data.worker.machine_type} · Rated Capacity: {data.worker.capacity_units_per_hr} units/hr · Current Status:{' '}
                      <span className="font-mono text-white">{data.worker.machine_status}</span>
                    </p>
                  </div>
                  <div className="p-4 bg-[#171A21] border border-neutral-800 rounded-md">
                    <p className="text-xs font-semibold text-neutral-300 mb-1">Mandatory Pre-Shift SOP & Safety Interlocks</p>
                    <p className="text-sm text-neutral-200 leading-relaxed">{data.worker.machine_instructions}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-400 mt-3">You are currently in the standby operator pool.</p>
              )}
            </div>
          )}

          {/* 8.7 REPORT MACHINE FAULT */}
          {activeTab === 'fault' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-6">
                <h3 className="text-base font-semibold text-[#F5F6F8]">Report Machine Fault</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Automatically sets machine status to FAULT, notifies Factory Manager & Maintenance Technicians, and feeds the Intelligent Recovery Engine.
                </p>
                <form onSubmit={handleReportMachineFault} className="space-y-3.5 mt-4">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Affected Machine</label>
                    <select
                      value={faultForm.machineId}
                      onChange={(e) => setFaultForm({ ...faultForm, machineId: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    >
                      {data.allMachines.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.machine_code} — {m.name} [{m.status}]
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Fault Category</label>
                      <select
                        value={faultForm.faultCategory}
                        onChange={(e) => setFaultForm({ ...faultForm, faultCategory: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        <option value="Servo / Spindle Overload">Servo / Spindle Overload</option>
                        <option value="Hydraulic Pressure Drop">Hydraulic Pressure Drop</option>
                        <option value="PLC Interlock Alarm">PLC Interlock Alarm</option>
                        <option value="Coolant / Pneumatic Leak">Coolant / Pneumatic Leak</option>
                        <option value="Tooling / Feed Jam">Tooling / Feed Jam</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Severity</label>
                      <select
                        value={faultForm.priority}
                        onChange={(e) => setFaultForm({ ...faultForm, priority: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        <option value="CRITICAL">CRITICAL (Line Halted)</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="LOW">LOW</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Observed Symptoms & Alarm Codes</label>
                    <textarea
                      rows={3}
                      required
                      value={faultForm.description}
                      onChange={(e) => setFaultForm({ ...faultForm, description: e.target.value })}
                      placeholder="Describe abnormal vibration, alarm code, or halted batch stage..."
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 text-xs font-semibold bg-[#EC4899] text-white rounded-md hover:bg-pink-500"
                  >
                    Submit Machine Fault Report
                  </button>
                </form>
              </div>

              <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-[#F5F6F8] mb-3">My Submitted Machine Fault Reports</h3>
                <div className="divide-y divide-neutral-800">
                  {data.faultReports.length === 0 ? (
                    <p className="text-xs text-neutral-400 py-4">No fault reports submitted by you yet.</p>
                  ) : (
                    data.faultReports.map((fr: any) => (
                      <div key={fr.id} className="py-3 text-xs">
                        <div className="flex justify-between font-mono">
                          <span className="text-[#E879F9]">{fr.request_code} · {fr.machine_code}</span>
                          <span className="text-neutral-300">{fr.status}</span>
                        </div>
                        <p className="text-white font-medium mt-1">{fr.fault_category} ({fr.priority})</p>
                        <p className="text-neutral-400 mt-0.5">{fr.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 8.8 SAFETY INCIDENT REPORTING */}
          {activeTab === 'safety' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-6">
                <h3 className="text-base font-semibold text-[#F5F6F8]">Report Workplace Incident or Hazard</h3>
                <form onSubmit={handleReportSafety} className="space-y-3.5 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Report Type</label>
                      <select
                        value={safetyForm.incidentType}
                        onChange={(e) => setSafetyForm({ ...safetyForm, incidentType: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        <option value="HAZARD">Preventive Hazard</option>
                        <option value="INCIDENT">Workplace Incident</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Severity</label>
                      <select
                        value={safetyForm.severity}
                        onChange={(e) => setSafetyForm({ ...safetyForm, severity: e.target.value })}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      >
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="LOW">LOW</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Safety Category</label>
                    <select
                      value={safetyForm.category}
                      onChange={(e) => setSafetyForm({ ...safetyForm, category: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    >
                      <option value="Machine Guarding / Interlock">Machine Guarding / Interlock</option>
                      <option value="Fume Extraction & Ventilation">Fume Extraction & Ventilation</option>
                      <option value="Floor Coolant / Oil Spill">Floor Coolant / Oil Spill</option>
                      <option value="PPE / Electrical Clearance">PPE / Electrical Clearance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Detailed Location & Description</label>
                    <textarea
                      rows={3}
                      required
                      value={safetyForm.description}
                      onChange={(e) => setSafetyForm({ ...safetyForm, description: e.target.value })}
                      placeholder="Specify bay location, hazard condition, and immediate precautions taken..."
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 text-xs font-semibold bg-[#EF4444] text-white rounded-md hover:bg-red-500"
                  >
                    Submit Safety Report
                  </button>
                </form>
              </div>

              <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-[#F5F6F8] mb-3">My Safety Reports & Resolution Status</h3>
                <div className="divide-y divide-neutral-800">
                  {data.safetyReports.length === 0 ? (
                    <p className="text-xs text-neutral-400 py-4">No safety incidents reported by you.</p>
                  ) : (
                    data.safetyReports.map((sr: any) => (
                      <div key={sr.id} className="py-3 text-xs">
                        <div className="flex justify-between font-mono">
                          <span className="text-[#EF4444]">{sr.incident_code} · {sr.severity}</span>
                          <span className="text-neutral-300">{sr.status}</span>
                        </div>
                        <p className="text-white font-medium mt-1">{sr.category}</p>
                        <p className="text-neutral-400 mt-0.5">{sr.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* QUALITY INSPECTION & DEFECT LOGGING */}
          {activeTab === 'quality' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Inspection Entry Form */}
              <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-6">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                  <h3 className="text-base font-semibold text-[#F5F6F8]">Record Quality Inspection Batch</h3>
                  <span className="text-xs text-neutral-400 font-mono">Real-time Yield Formula Check</span>
                </div>

                <form onSubmit={handleQualitySubmit} className="space-y-4 mt-4 text-xs">
                  <div>
                    <label className="block text-neutral-300 mb-1">Target Production Order / Task</label>
                    <select
                      value={qualityForm.orderId}
                      onChange={(e) => {
                        const order = data.tasks.find((t: any) => t.order_id === e.target.value);
                        setQualityForm({
                          ...qualityForm,
                          orderId: e.target.value,
                          taskId: order?.id || '',
                        });
                      }}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-white focus:outline-none"
                      required
                    >
                      <option value="">-- Select Active Production Order --</option>
                      {(data.tasks || []).map((t: any) => (
                        <option key={t.id} value={t.order_id}>
                          {t.order_code} — {t.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantities Grid */}
                  <div className="grid grid-cols-3 gap-3 font-mono">
                    <div>
                      <label className="block text-[11px] text-neutral-300 mb-1">INSPECTED</label>
                      <input
                        type="number"
                        min="1"
                        value={qualityForm.inspectedQty}
                        onChange={(e) => {
                          const ins = parseInt(e.target.value, 10) || 0;
                          setQualityForm({
                            ...qualityForm,
                            inspectedQty: ins,
                            acceptedQty: Math.max(0, ins - qualityForm.rejectedQty),
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-white font-bold"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#22C55E] mb-1">ACCEPTED</label>
                      <input
                        type="number"
                        min="0"
                        value={qualityForm.acceptedQty}
                        onChange={(e) => {
                          const acc = parseInt(e.target.value, 10) || 0;
                          setQualityForm({
                            ...qualityForm,
                            acceptedQty: acc,
                            rejectedQty: Math.max(0, qualityForm.inspectedQty - acc),
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-[#22C55E] font-bold"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#EF4444] mb-1">REJECTED</label>
                      <input
                        type="number"
                        min="0"
                        value={qualityForm.rejectedQty}
                        onChange={(e) => {
                          const rej = parseInt(e.target.value, 10) || 0;
                          setQualityForm({
                            ...qualityForm,
                            rejectedQty: rej,
                            acceptedQty: Math.max(0, qualityForm.inspectedQty - rej),
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-[#EF4444] font-bold"
                        required
                      />
                    </div>
                  </div>

                  {/* Live Formula Banner */}
                  <div className="p-3 bg-[#171A21] border border-neutral-800 rounded-md flex items-center justify-between text-xs font-mono">
                    <span className="text-neutral-400">
                      Formula: {qualityForm.acceptedQty} + {qualityForm.rejectedQty} = {qualityForm.inspectedQty}
                    </span>
                    <span className={`font-bold tabular-nums ${
                      qualityForm.inspectedQty > 0 && ((qualityForm.acceptedQty / qualityForm.inspectedQty) * 100) >= 95
                        ? 'text-[#22C55E]'
                        : 'text-amber-400'
                    }`}>
                      Yield: {qualityForm.inspectedQty > 0 ? ((qualityForm.acceptedQty / qualityForm.inspectedQty) * 100).toFixed(1) : 0}%
                    </span>
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Defect Classification (If Any)</label>
                    <select
                      value={qualityForm.rejectionCategory}
                      onChange={(e) => setQualityForm({ ...qualityForm, rejectionCategory: e.target.value })}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-white focus:outline-none"
                    >
                      <option value="NONE">None - 100% Conforming Batch</option>
                      <option value="DIMENSIONAL_DEFECT">Dimensional Tolerance Variance</option>
                      <option value="SURFACE_FINISH">Surface Roughness / Micro-Fracture</option>
                      <option value="ASSEMBLY_TOLERANCE">Assembly Fastener Torque Gap</option>
                      <option value="MATERIAL_DEFECT">Substrate Ingot Porosity</option>
                      <option value="ELECTRICAL_FAULT">Dielectric Resistance Fault</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Inspector Notes & Gauge Readings</label>
                    <textarea
                      rows={2}
                      value={qualityForm.notes}
                      onChange={(e) => setQualityForm({ ...qualityForm, notes: e.target.value })}
                      placeholder="Enter vernier caliper / optical micrometer readings or quarantine disposition..."
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-white placeholder-neutral-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingQuality}
                    className="w-full py-2.5 px-4 text-xs font-bold bg-[#22C55E] text-[#171A21] rounded-md hover:bg-green-400 transition-colors"
                  >
                    {submittingQuality ? 'Recording Inspection...' : 'Commit Quality Inspection'}
                  </button>
                </form>
              </div>

              {/* Inspection History Log */}
              <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-6 flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">Recent Quality Batch Logs</h3>
                  <span className="text-xs text-neutral-400 font-mono">({qualityInspections.length})</span>
                </div>

                <div className="divide-y divide-neutral-800 mt-2 overflow-y-auto max-h-[460px]">
                  {qualityInspections.length === 0 ? (
                    <p className="text-xs text-neutral-400 py-6 text-center font-mono">No quality inspections recorded yet.</p>
                  ) : (
                    qualityInspections.map((qi: any) => (
                      <div key={qi.id} className="py-3 text-xs space-y-1">
                        <div className="flex justify-between items-center font-mono">
                          <span className="font-semibold text-white">{qi.inspection_code} · {qi.order_code}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            qi.quality_rate >= 95 ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-[#EF4444]/20 text-[#EF4444]'
                          }`}>
                            {qi.quality_rate}% Yield
                          </span>
                        </div>
                        <p className="text-neutral-300 font-medium">{qi.product_name}</p>
                        <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                          <span>Accepted: {qi.accepted_qty} / {qi.inspected_qty} (Rej: {qi.rejected_qty})</span>
                          <span>{qi.rejection_category !== 'NONE' ? qi.rejection_category : 'Passed'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 8.2 MY PROFILE & QUALIFICATIONS */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6">
                <h3 className="text-base font-semibold text-[#F5F6F8]">Operator Record</h3>
                <dl className="mt-4 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">Full Name</dt>
                    <dd className="text-white font-medium">{data.worker.full_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">Employee ID</dt>
                    <dd className="font-mono text-[#E879F9]">{data.worker.employee_code}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">Department</dt>
                    <dd className="text-white">{data.worker.department_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">Designation</dt>
                    <dd className="text-white">{data.worker.designation}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">Experience</dt>
                    <dd className="font-mono text-white">{data.worker.experience_years} Years</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F6F8] mb-2">Verified Operational Skills</h3>
                  <div className="space-y-1.5 text-xs">
                    {data.skills.map((s: any) => (
                      <div key={s.code} className="flex justify-between p-2 bg-[#171A21] border border-neutral-800 rounded">
                        <span className="text-white">{s.name}</span>
                        <span className="font-mono text-[#C084FC]">Level {s.proficiency_level}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F6F8] mb-2">Active Safety Certifications</h3>
                  <div className="space-y-1.5 text-xs">
                    {data.certifications.map((c: any) => (
                      <div key={c.id} className="flex justify-between p-2 bg-[#171A21] border border-neutral-800 rounded">
                        <span className="text-white">{c.name}</span>
                        <span className="font-mono text-[#22C55E]">Exp {c.expiry_date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
};
