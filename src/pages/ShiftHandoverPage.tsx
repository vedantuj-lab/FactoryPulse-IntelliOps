import React, { useState, useEffect, useCallback } from 'react';
import {
  Repeat,
  Plus,
  CheckCircle,
  Clock,
  AlertTriangle,
  Cpu,
  ShieldAlert,
  ClipboardList,
  Check,
  ChevronRight,
  UserCheck,
  FileText,
  Calendar,
  Layers,
} from 'lucide-react';
import { DashboardShell } from '../components/DashboardShell';
import { MANAGER_NAV_ITEMS } from './RecoveryEnginePage';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface ShiftHandoverRecord {
  id: string;
  handover_code: string;
  factory_name: string;
  department_name: string;
  outgoing_shift_name: string;
  incoming_shift_name: string;
  submitted_by_name: string;
  acknowledged_by_name: string | null;
  handover_date: string;
  pending_tasks_json: string;
  machine_faults_json: string;
  maintenance_status_json: string;
  safety_incidents_json: string;
  operationalNotes: string;
  status: 'SUBMITTED' | 'ACKNOWLEDGED';
  created_at: string;
  acknowledged_at: string | null;
}

export const ShiftHandoverPage: React.FC = () => {
  const { user } = useAuth();
  const { notify } = useToast();

  const [loading, setLoading] = useState(true);
  const [handovers, setHandovers] = useState<ShiftHandoverRecord[]>([]);
  const [selectedHandover, setSelectedHandover] = useState<ShiftHandoverRecord | null>(null);

  // New Handover Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [contextData, setContextData] = useState<any>(null);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [outgoingShiftId, setOutgoingShiftId] = useState('');
  const [incomingShiftId, setIncomingShiftId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadHandovers = useCallback(async () => {
    try {
      const data = await apiFetch<{ handovers: ShiftHandoverRecord[] }>('/api/shift-handover');
      setHandovers(data.handovers || []);
      if (!selectedHandover && data.handovers && data.handovers.length > 0) {
        setSelectedHandover(data.handovers[0]);
      }
    } catch (err: any) {
      notify('Failed to load shift handovers: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, selectedHandover]);

  const loadContext = async () => {
    try {
      const ctx = await apiFetch<any>('/api/shift-handover/current-context');
      setContextData(ctx);
      if (ctx.departments && ctx.departments.length > 0) {
        setSelectedDeptId(ctx.departments[0].id);
      }
      if (ctx.shifts && ctx.shifts.length >= 2) {
        setOutgoingShiftId(ctx.shifts[0].id);
        setIncomingShiftId(ctx.shifts[1].id);
      }
    } catch (err: any) {
      notify('Failed to load current shop floor context: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    loadHandovers();
    loadContext();
  }, [loadHandovers]);

  const handleOpenModal = () => {
    loadContext();
    setModalOpen(true);
  };

  const handleSubmitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      notify('Please provide operational transition notes.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/shift-handover', {
        method: 'POST',
        body: JSON.stringify({
          departmentId: selectedDeptId,
          outgoingShiftId,
          incomingShiftId,
          pendingTasks: contextData?.pendingTasks || [],
          machineFaults: contextData?.machineFaults || [],
          maintenanceStatus: contextData?.openMaintenance || [],
          safetyIncidents: contextData?.unresolvedSafety || [],
          operationalNotes: notes,
        }),
      });

      notify('Shift handover report filed and broadcasted successfully.', 'success');
      setModalOpen(false);
      setNotes('');
      loadHandovers();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await apiFetch(`/api/shift-handover/${id}/acknowledge`, { method: 'POST' });
      notify('Shift handover acknowledged.', 'success');
      loadHandovers();
      if (selectedHandover && selectedHandover.id === id) {
        setSelectedHandover({
          ...selectedHandover,
          status: 'ACKNOWLEDGED',
          acknowledged_by_name: user?.fullName || 'Current Supervisor',
          acknowledged_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const parseSafe = (json: string) => {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  return (
    <DashboardShell
      roleTitle="Factory Manager"
      accentHex="#FF8A32"
      navItems={MANAGER_NAV_ITEMS}
      activeTab="shift-handover"
      onSelectTab={() => {}}
      pageTitle="Inter-Shift Handover Protocol"
      breadcrumbSub="Seamless Production Continuity"
      headerActions={
        <button
          onClick={handleOpenModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF8A32] text-[#171A21] rounded font-semibold text-xs hover:bg-[#ff9b4f] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Handover Report</span>
        </button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Handover Logs List */}
        <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4 flex flex-col h-[700px]">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-[#FF8A32]" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white">Shift Handover Logs</h2>
            </div>
            <span className="text-xs text-neutral-400 font-mono">({handovers.length})</span>
          </div>

          <div className="divide-y divide-neutral-800/80 overflow-y-auto mt-2 flex-1 pr-1">
            {handovers.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500 font-mono">
                No shift handover reports recorded yet. Click "New Handover Report" to submit.
              </div>
            ) : (
              handovers.map((h) => {
                const isSelected = selectedHandover?.id === h.id;
                return (
                  <button
                    key={h.id}
                    onClick={() => setSelectedHandover(h)}
                    className={`w-full text-left py-3 px-2 rounded transition-colors block ${
                      isSelected ? 'bg-[#171A21] border border-neutral-700' : 'hover:bg-[#1f242d]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-white">{h.handover_code}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        h.status === 'ACKNOWLEDGED' ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-[#FF8A32]/20 text-[#FF8A32]'
                      }`}>
                        {h.status}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-300 font-medium mt-1">
                      {h.department_name}
                    </div>

                    <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-1 font-mono">
                      <span>{h.outgoing_shift_name}</span>
                      <ChevronRight className="w-3 h-3 text-neutral-500" />
                      <span className="text-neutral-200">{h.incoming_shift_name}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-500 mt-2">
                      <span>By: {h.submitted_by_name}</span>
                      <span className="font-mono">{new Date(h.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Handover Inspection & Acknowledgment */}
        <div className="lg:col-span-2 bg-[#242A33] border border-neutral-800 rounded-lg p-6 flex flex-col h-[700px] overflow-y-auto">
          {!selectedHandover ? (
            <div className="h-full flex items-center justify-center text-xs text-neutral-500 font-mono">
              Select a shift handover report from the left panel to review details.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header Box */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-white">{selectedHandover.handover_code}</span>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-semibold ${
                      selectedHandover.status === 'ACKNOWLEDGED' ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-[#FF8A32]/20 text-[#FF8A32]'
                    }`}>
                      {selectedHandover.status}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 mt-1">
                    Department: <strong className="text-neutral-200">{selectedHandover.department_name}</strong> · Filed: {new Date(selectedHandover.created_at).toLocaleString()}
                  </div>
                </div>

                {selectedHandover.status === 'SUBMITTED' && (
                  <button
                    onClick={() => handleAcknowledge(selectedHandover.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#22C55E] hover:bg-[#16a34a] text-[#171A21] font-bold text-xs rounded transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>Acknowledge Handover</span>
                  </button>
                )}
              </div>

              {/* Transition Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#171A21] border border-neutral-800 rounded-lg p-3 text-xs">
                <div>
                  <span className="text-[10px] text-neutral-500 block font-mono uppercase">Outgoing Shift</span>
                  <span className="font-semibold text-white mt-0.5 block">{selectedHandover.outgoing_shift_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 block font-mono uppercase">Incoming Shift</span>
                  <span className="font-semibold text-[#19C6B4] mt-0.5 block">{selectedHandover.incoming_shift_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 block font-mono uppercase">Submitted By</span>
                  <span className="text-neutral-300 mt-0.5 block">{selectedHandover.submitted_by_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 block font-mono uppercase">Acknowledged By</span>
                  <span className={`mt-0.5 block ${selectedHandover.acknowledged_by_name ? 'text-[#22C55E]' : 'text-neutral-500'}`}>
                    {selectedHandover.acknowledged_by_name || 'Pending Ack'}
                  </span>
                </div>
              </div>

              {/* Operational Transition Notes */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-[#FF8A32]" />
                  <span>Supervisor Operational Notes & Hot Items</span>
                </h3>
                <div className="bg-[#171A21] border border-neutral-800 rounded-md p-3 text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap">
                  {selectedHandover.operationalNotes}
                </div>
              </div>

              {/* Pending Tasks Handed Over */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2 flex items-center gap-2">
                  <ClipboardList className="w-3.5 h-3.5 text-[#19C6B4]" />
                  <span>In-Flight Tasks Passed to Incoming Shift</span>
                </h3>
                <div className="bg-[#171A21] border border-neutral-800 rounded-md divide-y divide-neutral-800/80 text-xs">
                  {parseSafe(selectedHandover.pending_tasks_json).length === 0 ? (
                    <div className="p-3 text-neutral-500 font-mono text-xs">No active in-flight tasks transferred.</div>
                  ) : (
                    parseSafe(selectedHandover.pending_tasks_json).map((t: any, idx: number) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-white">{t.title}</span>
                          <span className="text-neutral-400 ml-2 font-mono">[{t.order_code}]</span>
                        </div>
                        <span className="px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded text-[10px] font-mono">
                          {t.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Active Machine Outages / Faults */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2 flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-[#EF4444]" />
                  <span>Unresolved Machine Outages</span>
                </h3>
                <div className="bg-[#171A21] border border-neutral-800 rounded-md divide-y divide-neutral-800/80 text-xs">
                  {parseSafe(selectedHandover.machine_faults_json).length === 0 ? (
                    <div className="p-3 text-neutral-500 font-mono text-xs">All machines operational at handover.</div>
                  ) : (
                    parseSafe(selectedHandover.machine_faults_json).map((m: any, idx: number) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-white">{m.machine_code}</span>
                          <span className="text-neutral-400 ml-2">{m.name}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-[#EF4444]/20 text-[#EF4444] rounded text-[10px] font-mono font-semibold">
                          {m.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Unresolved Safety Incidents */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Active Safety Watch Items</span>
                </h3>
                <div className="bg-[#171A21] border border-neutral-800 rounded-md divide-y divide-neutral-800/80 text-xs">
                  {parseSafe(selectedHandover.safety_incidents_json).length === 0 ? (
                    <div className="p-3 text-[#22C55E] font-mono text-xs">Zero unresolved safety incidents reported.</div>
                  ) : (
                    parseSafe(selectedHandover.safety_incidents_json).map((s: any, idx: number) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-amber-300">{s.incident_code}</span>
                          <span className="text-neutral-300 ml-2">{s.title}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-400/20 text-amber-300 rounded text-[10px] font-mono">
                          {s.severity}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Handover Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#242A33] border border-neutral-700 rounded-lg max-w-xl w-full p-6 text-[#F5F6F8] max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Create Shift Handover Report</h3>
            <p className="text-xs text-neutral-400 mt-1">
              Document shift performance, in-flight work orders, and critical shop floor conditions for incoming supervisor sign-off.
            </p>

            <form onSubmit={handleSubmitHandover} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-neutral-300 mb-1">Department</label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded text-neutral-200 focus:outline-none focus:border-[#FF8A32]"
                >
                  {(contextData?.departments || []).map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-300 mb-1">Outgoing Shift</label>
                  <select
                    value={outgoingShiftId}
                    onChange={(e) => setOutgoingShiftId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded text-neutral-200 focus:outline-none"
                  >
                    {(contextData?.shifts || []).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-neutral-300 mb-1">Incoming Shift</label>
                  <select
                    value={incomingShiftId}
                    onChange={(e) => setIncomingShiftId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded text-neutral-200 focus:outline-none"
                  >
                    {(contextData?.shifts || []).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Snapshot Summary of context auto-included */}
              <div className="p-3 bg-[#171A21] border border-neutral-800 rounded space-y-1 text-[11px] text-neutral-400 font-mono">
                <div className="text-neutral-300 font-semibold mb-1 uppercase text-[10px]">Auto-Captured Operational Context:</div>
                <div className="flex justify-between">
                  <span>In-flight Tasks:</span>
                  <span className="text-white">{(contextData?.pendingTasks || []).length} items</span>
                </div>
                <div className="flex justify-between">
                  <span>Machines in FAULT:</span>
                  <span className={(contextData?.machineFaults || []).length > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}>
                    {(contextData?.machineFaults || []).length} units
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Unresolved Safety:</span>
                  <span className={(contextData?.unresolvedSafety || []).length > 0 ? 'text-amber-400' : 'text-[#22C55E]'}>
                    {(contextData?.unresolvedSafety || []).length} open
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-300 mb-1">Supervisor Transition Notes & Critical Instructions</label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detail tool wear observations, material batch variations, maintenance technician ETAs, or priority customer order directives..."
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-[#FF8A32]"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#FF8A32] hover:bg-[#ff9b4f] text-[#171A21] font-semibold text-xs rounded"
                >
                  {submitting ? 'Submitting Handover...' : 'Submit Handover Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
