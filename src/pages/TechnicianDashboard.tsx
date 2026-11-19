import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Wrench,
  CalendarClock,
  History,
  CheckCircle2,
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
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';

const TECH_NAV: NavItem[] = [
  { id: 'overview', label: '1. Maintenance Overview', icon: LayoutDashboard, group: 'Technician Terminal' },
  { id: 'requests', label: '2. Assigned Repairs', icon: Wrench, group: 'Technician Terminal' },
  { id: 'schedule', label: '3. Preventive Schedule', icon: CalendarClock, group: 'Technician Terminal' },
  { id: 'history', label: '4. Service History', icon: History, group: 'Technician Terminal' },
];

export const TechnicianDashboard: React.FC = () => {
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  const [requests, setRequests] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [maintAnalytics, setMaintAnalytics] = useState<any>(null);

  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [repairNotes, setRepairNotes] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [downtimeMins, setDowntimeMins] = useState(45);

  const loadTechData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, macRes, anRes] = await Promise.all([
        apiFetch('/api/maintenance/requests'),
        apiFetch('/api/machines'),
        apiFetch('/api/analytics/maintenance'),
      ]);
      setRequests(mRes.requests);
      setSchedules(mRes.schedules);
      setMachines(macRes.machines);
      setMaintAnalytics(anRes);

      const firstOpen = mRes.requests.find((r: any) => r.status !== 'COMPLETED');
      if (firstOpen && !selectedReq) {
        setSelectedReq(firstOpen);
        setDiagnosis(firstOpen.diagnosis || '');
        setRepairNotes(firstOpen.repair_notes || '');
        setPartsUsed(firstOpen.parts_used || '');
        setDowntimeMins(firstOpen.downtime_minutes || 45);
      }
    } catch (err: any) {
      notify('error', 'Failed to load technician dashboard', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify, selectedReq]);

  useEffect(() => {
    loadTechData();
  }, [loadTechData]);

  const handleSelectRequest = (r: any) => {
    setSelectedReq(r);
    setDiagnosis(r.diagnosis || '');
    setRepairNotes(r.repair_notes || '');
    setPartsUsed(r.parts_used || '');
    setDowntimeMins(r.downtime_minutes || 45);
  };

  const handleUpdateWorkflowStatus = async (reqId: string, nextStatus: string) => {
    try {
      const res = await apiFetch(`/api/maintenance/requests/${reqId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          diagnosis,
          repairNotes,
          partsUsed,
          downtimeMinutes: downtimeMins,
        }),
      });
      notify('success', 'Maintenance Status Updated', res.message);
      loadTechData();
    } catch (err: any) {
      notify('error', 'Update failed', err.message);
    }
  };

  const handleCompleteMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    try {
      const res = await apiFetch(`/api/maintenance/requests/${selectedReq.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          diagnosis,
          repairNotes,
          partsUsed,
          downtimeMinutes: downtimeMins,
          restoreMachineStatus: 'VERIFICATION_REQUIRED',
        }),
      });
      notify('success', 'Repair Report Submitted', 'Repair logged. Machine status moved to VERIFICATION_REQUIRED pending manager review.');
      setSelectedReq(null);
      loadTechData();
    } catch (err: any) {
      notify('error', 'Completion failed', err.message);
    }
  };

  const openRequests = requests.filter((r) => r.status !== 'COMPLETED');
  const completedRequests = requests.filter((r) => r.status === 'COMPLETED');
  const highPrioCount = openRequests.filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH').length;
  const underMaintMachines = machines.filter((m) => m.status === 'MAINTENANCE' || m.status === 'FAULT').length;
  const overdueSchedules = schedules.filter((s) => s.status === 'OVERDUE').length;

  const currentNav = TECH_NAV.find((n) => n.id === activeTab) || TECH_NAV[0];

  return (
    <DashboardShell
      roleTitle="Maintenance Technician"
      accentHex="#C2410C"
      navItems={TECH_NAV}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      pageTitle={currentNav.label}
      breadcrumbSub="Diagnostics, Repair Execution & Asset Service Records"
      headerActions={
        <button
          onClick={() => setActiveTab('requests')}
          className="px-3 py-1.5 text-xs font-semibold bg-[#C2410C] text-white rounded-md hover:bg-[#ea580c] transition-colors whitespace-nowrap shrink-0"
        >
          Open Active Work Orders ({openRequests.length})
        </button>
      }
    >
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 bg-[#242A33] border border-neutral-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* 9.1 TECHNICIAN OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Active Fault Queue', val: openRequests.length, color: 'text-white' },
                  { label: 'High-Priority Faults', val: highPrioCount, color: 'text-[#EF4444]' },
                  { label: 'Bays Fault / Maint', val: underMaintMachines, color: 'text-[#F59E0B]' },
                  { label: 'Upcoming Scheduled', val: schedules.filter((s) => s.status === 'SCHEDULED').length, color: 'text-[#10B981]' },
                  { label: 'Overdue Preventive', val: overdueSchedules, color: 'text-[#EF4444]' },
                  { label: 'Completed Repairs', val: completedRequests.length, color: 'text-[#22C55E]' },
                ].map((k) => (
                  <div key={k.label} className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
                    <p className="text-xs text-neutral-400">{k.label}</p>
                    <p className={`text-2xl font-bold font-mono tabular-nums mt-1 ${k.color}`}>{k.val}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8] mb-3">Fault Distribution by Category</h3>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={maintAnalytics?.byCategory || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="fault_category" stroke="#9CA3AF" fontSize={10} />
                        <YAxis stroke="#9CA3AF" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#171A21', borderColor: '#374151', fontSize: 12 }} />
                        <Bar dataKey="count" name="Fault Tickets" fill="#10B981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8] mb-3">Immediate Priority Dispatch Queue</h3>
                  <div className="divide-y divide-neutral-800">
                    {openRequests.map((r) => (
                      <div key={r.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                        <div>
                          <p className="font-mono font-semibold text-[#34D399]">
                            {r.request_code} · {r.machine_code} ({r.priority})
                          </p>
                          <p className="text-white mt-0.5">{r.fault_category}</p>
                          <p className="text-neutral-400 mt-0.5 truncate max-w-md">{r.description}</p>
                        </div>
                        <button
                          onClick={() => {
                            handleSelectRequest(r);
                            setActiveTab('requests');
                          }}
                          className="px-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-xs text-[#34D399] hover:text-white shrink-0"
                        >
                          Diagnose & Repair
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 9.2 & 9.3 ASSIGNED REQUESTS & MAINTENANCE WORKFLOW */}
          {activeTab === 'requests' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 space-y-3">
                {requests.map((r) => {
                  const isSel = selectedReq?.id === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => handleSelectRequest(r)}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        isSel ? 'bg-[#242A33] border-[#10B981]' : 'bg-[#1D222B] border-neutral-800 hover:border-neutral-600'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#34D399] font-semibold">
                          {r.request_code} · {r.machine_code}
                        </span>
                        <span className={r.status === 'COMPLETED' ? 'text-[#22C55E]' : 'text-[#F59E0B]'}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white mt-1">
                        {r.fault_category} <span className="text-xs font-mono text-[#EF4444]">[{r.priority}]</span>
                      </p>
                      <p className="text-xs text-neutral-300 mt-1">{r.description}</p>
                      <p className="text-[11px] text-neutral-400 mt-2">
                        Reported by {r.reported_by_name} · Department: {r.department_name}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="lg:col-span-6 bg-[#242A33] border border-neutral-800 rounded-lg p-6 h-fit">
                {!selectedReq ? (
                  <p className="text-xs text-neutral-400 py-8 text-center">
                    Select a maintenance ticket on the left to record diagnostics, parts used, or submit completion.
                  </p>
                ) : (
                  <form onSubmit={handleCompleteMaintenance} className="space-y-4">
                    <div className="pb-3 border-b border-neutral-800">
                      <p className="text-xs font-mono text-[#34D399]">
                        WORK ORDER {selectedReq.request_code} · {selectedReq.machine_code}
                      </p>
                      <h3 className="text-base font-semibold text-white mt-0.5">{selectedReq.machine_name}</h3>
                    </div>

                    {selectedReq.status !== 'COMPLETED' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateWorkflowStatus(selectedReq.id, 'IN_PROGRESS')}
                          className="px-3 py-1.5 text-xs font-semibold bg-[#171A21] border border-[#10B981] text-[#34D399] rounded"
                        >
                          Accept & Start Repair
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateWorkflowStatus(selectedReq.id, 'WAITING_FOR_APPROVAL')}
                          className="px-3 py-1.5 text-xs font-medium bg-[#171A21] border border-neutral-700 text-neutral-200 rounded"
                        >
                          Save Progress Notes
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Technical Root-Cause Diagnosis</label>
                      <textarea
                        rows={2}
                        required
                        value={diagnosis}
                        onChange={(e) => setDiagnosis(e.target.value)}
                        placeholder="Enter multimeter, thermal, or encoder diagnostic findings..."
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-300 mb-1">Repair Actions Performed</label>
                      <textarea
                        rows={2}
                        required
                        value={repairNotes}
                        onChange={(e) => setRepairNotes(e.target.value)}
                        placeholder="Replaced assembly, recalibrated zero-point, verified safety interlock..."
                        className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-neutral-300 mb-1">Parts / Consumables Used</label>
                        <input
                          type="text"
                          value={partsUsed}
                          onChange={(e) => setPartsUsed(e.target.value)}
                          placeholder="Harmonic cable #HC-4, Seal kit..."
                          className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-300 mb-1">Total Downtime (mins)</label>
                        <input
                          type="number"
                          min={5}
                          value={downtimeMins}
                          onChange={(e) => setDowntimeMins(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                        />
                      </div>
                    </div>

                    {selectedReq.status !== 'COMPLETED' ? (
                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 text-xs font-semibold bg-[#10B981] text-[#171A21] rounded-md hover:bg-emerald-400 inline-flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Complete Maintenance & Restore Machine Readiness
                      </button>
                    ) : (
                      <p className="text-xs font-mono text-[#22C55E]">
                        Completed at {new Date(selectedReq.completed_at).toLocaleString()}
                      </p>
                    )}
                  </form>
                )}
              </div>
            </div>
          )}

          {/* 9.4 PREVENTIVE SCHEDULE */}
          {activeTab === 'schedule' && (
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-neutral-800">
                <h3 className="text-sm font-semibold text-[#F5F6F8]">Preventive Maintenance Calendar</h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Scheduled Date</th>
                    <th className="py-3 px-4">Machine</th>
                    <th className="py-3 px-4">Service Scope</th>
                    <th className="py-3 px-4">Technician</th>
                    <th className="py-3 px-4 text-right">Est. Duration</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {schedules.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 px-4 font-mono tabular-nums text-white">{s.scheduled_date}</td>
                      <td className="py-3 px-4 font-mono text-[#34D399]">{s.machine_code} — {s.machine_name}</td>
                      <td className="py-3 px-4 text-neutral-200">{s.title}</td>
                      <td className="py-3 px-4 text-neutral-300">{s.technician_name}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{s.duration_hrs}h</td>
                      <td className="py-3 px-4 font-mono">
                        <span className={s.status === 'OVERDUE' ? 'text-[#EF4444]' : 'text-[#10B981]'}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 9.5 MACHINE SERVICE HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-neutral-800">
                <h3 className="text-sm font-semibold text-[#F5F6F8]">Completed Repair & Service Logs</h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Ticket</th>
                    <th className="py-3 px-4">Machine</th>
                    <th className="py-3 px-4">Diagnosis & Repair Notes</th>
                    <th className="py-3 px-4">Parts Used</th>
                    <th className="py-3 px-4 text-right">Downtime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {completedRequests.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 px-4 font-mono text-[#22C55E]">{r.request_code}</td>
                      <td className="py-3 px-4 font-mono text-white">{r.machine_code}</td>
                      <td className="py-3 px-4 text-neutral-300">
                        <p className="font-medium text-white">{r.diagnosis}</p>
                        <p className="text-neutral-400 mt-0.5">{r.repair_notes}</p>
                      </td>
                      <td className="py-3 px-4 text-neutral-300">{r.parts_used || 'Standard'}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{r.downtime_minutes}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
};
