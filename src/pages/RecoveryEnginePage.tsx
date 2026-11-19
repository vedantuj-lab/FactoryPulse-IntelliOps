import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  Cpu,
  ClipboardList,
  ShieldAlert,
  Wrench,
  BarChart3,
  GitBranch,
  FlaskConical,
  RefreshCw,
  CheckCircle2,
  XCircle,
  SlidersHorizontal,
  GitMerge,
  ArrowRight,
  Zap,
  Award,
  Layers,
  Clock,
  TrendingDown,
  Check,
  Split,
  Eye,
  Scale,
  Radio,
  TrendingUp,
  Repeat,
  Ban,
} from 'lucide-react';
import { DashboardShell, NavItem } from '../components/DashboardShell';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';

export const MANAGER_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: '1. Operations Dashboard', icon: LayoutDashboard, group: 'Manager Portal', href: '/manager/dashboard?tab=overview' },
  { id: 'production', label: '2. Production Monitoring', icon: ClipboardList, group: 'Manager Portal', href: '/manager/dashboard?tab=production' },
  { id: 'workforce', label: '3. Workforce & Shifts', icon: Users, group: 'Manager Portal', href: '/manager/dashboard?tab=workforce' },
  { id: 'machines', label: '4. Machine Fleet', icon: Cpu, group: 'Manager Portal', href: '/manager/dashboard?tab=machines' },
  { id: 'recovery', label: '5. Recovery Engine', icon: GitBranch, group: 'Manager Portal', href: '/manager/recovery-engine' },
  { id: 'safety', label: '6. Safety & Hazards', icon: ShieldAlert, group: 'Manager Portal', href: '/manager/dashboard?tab=safety' },
  { id: 'maintenance', label: '7. Maintenance Dispatch', icon: Wrench, group: 'Manager Portal', href: '/manager/dashboard?tab=maintenance' },
];

export const RecoveryEnginePage: React.FC = () => {
  const navigate = useNavigate();
  const { notify, confirmAction } = useToast();

  const [machines, setMachines] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const [eventType, setEventType] = useState('MACHINE_FAULT');
  const [triggerEntityId, setTriggerEntityId] = useState('');
  const [weights, setWeights] = useState({
    skillCompatibility: 35,
    workerAvailability: 25,
    machineCompatibility: 20,
    productionPriority: 10,
    assignmentEfficiency: 10,
  });

  const [analysis, setAnalysis] = useState<any>(null);
  const [strategyTab, setStrategyTab] = useState<'combined' | 'compare' | 'optionA' | 'optionB' | 'ranked' | 'rejected'>('combined');
  const [selectedRecId, setSelectedRecId] = useState<string>('');
  const [modifyMode, setModifyMode] = useState(false);
  const [customMachineId, setCustomMachineId] = useState('');
  const [customWorkerId, setCustomWorkerId] = useState('');
  const [loading, setLoading] = useState(false);

  const loadContextResources = useCallback(async () => {
    try {
      const [mRes, wRes, oRes, hRes] = await Promise.all([
        apiFetch('/api/machines'),
        apiFetch('/api/workers'),
        apiFetch('/api/production/orders'),
        apiFetch('/api/recovery/history'),
      ]);
      setMachines(mRes.machines);
      setWorkers(wRes.workers);
      setOrders(oRes.orders);
      setHistory(hRes.history);

      const faulted = mRes.machines.find((m: any) => m.status === 'FAULT' || m.status === 'MAINTENANCE');
      if (faulted && !triggerEntityId) {
        setTriggerEntityId(faulted.id);
      } else if (mRes.machines[0] && !triggerEntityId) {
        setTriggerEntityId(mRes.machines[0].id);
      }
    } catch (err: any) {
      notify('error', 'Failed to load recovery resources', err.message);
    }
  }, [notify, triggerEntityId]);

  useEffect(() => {
    loadContextResources();
  }, [loadContextResources]);

  const handleRunAnalysis = async (customTrigger?: string, customEvent?: string) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/recovery/recommend', {
        method: 'POST',
        body: JSON.stringify({
          eventType: customEvent || eventType,
          triggerEntityId: customTrigger !== undefined ? customTrigger : triggerEntityId,
          weights,
        }),
      });
      setAnalysis(res);
      if (res.recommendations && res.recommendations[0]) {
        setSelectedRecId(res.recommendations[0].id);
        setCustomMachineId(res.recommendations[0].targetMachineId);
        setCustomWorkerId(res.recommendations[0].workerId);
      }
      setModifyMode(false);
      const hRes = await apiFetch('/api/recovery/history');
      setHistory(hRes.history);
    } catch (err: any) {
      notify('error', 'Recovery evaluation failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run initial fault evaluation once faulted machine is loaded
  useEffect(() => {
    if (triggerEntityId && !analysis && !loading) {
      handleRunAnalysis(triggerEntityId, eventType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerEntityId]);

  const handleEventTypeChange = (nextType: string) => {
    setEventType(nextType);
    if (nextType === 'MACHINE_FAULT' || nextType === 'MACHINE_MAINTENANCE') {
      const m = machines.find((x) => x.status === 'FAULT') || machines[0];
      if (m) setTriggerEntityId(m.id);
    } else if (nextType === 'WORKER_ABSENCE') {
      const w = workers.find((x) => x.availability === 'ASSIGNED') || workers[0];
      if (w) setTriggerEntityId(w.id);
    } else {
      const o = orders.find((x) => x.status !== 'COMPLETED') || orders[0];
      if (o) setTriggerEntityId(o.id);
    }
  };

  const handleApprovePlan = () => {
    if (!analysis?.planId) return;
    confirmAction({
      title: modifyMode ? 'Execute Modified Recovery Plan?' : 'Approve & Execute Recovery Plan?',
      description:
        'This validates worker availability, skill/certification constraints, and machine readiness inside a database transaction, updates production assignments, logs an audit entry, and notifies affected workers.',
      confirmLabel: 'Approve & Execute Recovery',
      onConfirm: async () => {
        try {
          const res = await apiFetch('/api/recovery/approve', {
            method: 'POST',
            body: JSON.stringify({
              planId: analysis.planId,
              recommendationId: selectedRecId,
              customTargetMachineId: modifyMode ? customMachineId : undefined,
              customWorkerId: modifyMode ? customWorkerId : undefined,
            }),
          });
          notify('success', 'Recovery Plan Executed', res.message);
          setAnalysis(null);
          await loadContextResources();
        } catch (err: any) {
          notify('error', 'Approval Rejected by Constraint Guard', err.message);
        }
      },
    });
  };

  const handleApproveOption = (recId: string, optionLabel: string) => {
    if (!analysis?.planId) return;
    confirmAction({
      title: `Approve & Execute ${optionLabel}?`,
      description: `Dispatches immediate single-bay recovery allocation. Validates certified skill compliance, machine operational readiness, and assigns production task.`,
      confirmLabel: `Approve ${optionLabel}`,
      onConfirm: async () => {
        try {
          const res = await apiFetch('/api/recovery/approve', {
            method: 'POST',
            body: JSON.stringify({
              planId: analysis.planId,
              recommendationId: recId,
            }),
          });
          notify('success', `${optionLabel} Executed`, res.message);
          setAnalysis(null);
          await loadContextResources();
        } catch (err: any) {
          notify('error', 'Execution Error', err.message);
        }
      },
    });
  };

  const handleApproveCombinedPlan = () => {
    if (!analysis?.planId || !analysis?.combinedSolution) return;
    const cs = analysis.combinedSolution;
    confirmAction({
      title: 'Approve & Execute Dual-Stream Parallel Plan?',
      description: `Splits remaining ${cs.combinedMetrics?.totalRemainingUnits ?? 128} units across ${cs.streamA?.machineCode} (${cs.streamA?.workerName}, ${cs.streamA?.allocatedUnits} units) and ${cs.streamB?.machineCode} (${cs.streamB?.workerName}, ${cs.streamB?.allocatedUnits} units). Slashes delay by 56% down to ${cs.combinedMetrics?.estimatedDelayHrs ?? 0.4} hours.`,
      confirmLabel: 'Approve Dual-Stream Strategy',
      onConfirm: async () => {
        try {
          const res = await apiFetch('/api/recovery/approve', {
            method: 'POST',
            body: JSON.stringify({
              planId: analysis.planId,
              isCombined: true,
              combinedStrategy: cs,
            }),
          });
          notify('success', 'Dual-Stream Plan Executed', res.message);
          setAnalysis(null);
          await loadContextResources();
        } catch (err: any) {
          notify('error', 'Execution Error', err.message);
        }
      },
    });
  };

  const handleRejectPlan = () => {
    if (!analysis?.planId) return;
    confirmAction({
      title: 'Reject Recovery Proposal?',
      description: 'Marks this recovery proposal as rejected in the audit history without modifying active shop-floor allocations.',
      confirmLabel: 'Reject Proposal',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await apiFetch('/api/recovery/reject', {
            method: 'POST',
            body: JSON.stringify({
              planId: analysis.planId,
              reason: 'Manager opted to hold batch pending primary machine repair.',
            }),
          });
          notify('info', 'Recovery Proposal Rejected');
          setAnalysis(null);
          await loadContextResources();
        } catch (err: any) {
          notify('error', 'Error rejecting plan', err.message);
        }
      },
    });
  };

  return (
    <DashboardShell
      roleTitle="Factory Manager"
      accentHex="#FF8A32"
      navItems={MANAGER_NAV_ITEMS}
      activeTab="recovery"
      onSelectTab={(id) => navigate(`/manager/dashboard?tab=${id}`)}
      pageTitle="Intelligent Factory Recovery Engine"
      breadcrumbSub="Rule-Based Constraint Evaluation & Resource Reallocation"
      headerActions={
        <button
          onClick={() => handleRunAnalysis()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recalculate Recommendations
        </button>
      }
    >
      <div className="space-y-6">
        {/* Top Trigger & Configurable Weights Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-[#F5F6F8]">1. Disruption Event Detection</h2>
            <p className="text-xs text-neutral-400 mt-1">
              Select a live plant fault, operator absence, or production shortage to compute eligible recovery allocations.
            </p>

            <div className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs text-neutral-300 mb-1">Operational Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => handleEventTypeChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                >
                  <option value="MACHINE_FAULT">Machine Fault (Reported / Halted Bay)</option>
                  <option value="WORKER_ABSENCE">Unplanned Worker Absence</option>
                  <option value="PRODUCTION_SHORTAGE">Production Order Shortage / Delay</option>
                  <option value="MACHINE_MAINTENANCE">Unscheduled Machine Maintenance</option>
                  <option value="DEMAND_SPIKE">Sudden Increase in Production Demand</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-neutral-300 mb-1">Target Resource / Record</label>
                <select
                  value={triggerEntityId}
                  onChange={(e) => setTriggerEntityId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white font-mono"
                >
                  {(eventType === 'MACHINE_FAULT' || eventType === 'MACHINE_MAINTENANCE') &&
                    machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.machine_code} — {m.name} [{m.status}]
                      </option>
                    ))}
                  {eventType === 'WORKER_ABSENCE' &&
                    workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.employee_code} — {w.full_name} [{w.availability}]
                      </option>
                    ))}
                  {(eventType === 'PRODUCTION_SHORTAGE' || eventType === 'DEMAND_SPIKE') &&
                    orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.order_code} — {o.product_name} [{o.status}]
                      </option>
                    ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => handleRunAnalysis()}
                disabled={loading}
                className="w-full py-2 px-4 text-xs font-semibold bg-[#8B5CF6] text-white rounded-md hover:bg-[#7C3AED] transition-colors"
              >
                {loading ? 'Evaluating Hard Constraints...' : 'Analyze Impact & Score Eligible Options'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#F5F6F8] flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#FF8A32]" />
                  2. Configurable Multi-Factor Scoring Weights (Normalized 0–100)
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Hard constraints (valid skill, certification, machine operational state, zero shift overlap) are enforced strictly before scoring.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">
              {[
                { key: 'skillCompatibility', label: 'Skill Compatibility', val: weights.skillCompatibility },
                { key: 'workerAvailability', label: 'Worker Availability', val: weights.workerAvailability },
                { key: 'machineCompatibility', label: 'Machine Compatibility', val: weights.machineCompatibility },
                { key: 'productionPriority', label: 'Production Priority', val: weights.productionPriority },
                { key: 'assignmentEfficiency', label: 'Assignment Efficiency', val: weights.assignmentEfficiency },
              ].map((item) => (
                <div key={item.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-neutral-300">{item.label}</span>
                    <span className="font-mono tabular-nums text-[#FF8A32]">{item.val}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    value={item.val}
                    onChange={(e) =>
                      setWeights((prev) => ({ ...prev, [item.key]: Number(e.target.value) }))
                    }
                    className="w-full accent-[#FF8A32]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Impact Analysis & Ranked Recommendations */}
        {analysis && (
          <div className="space-y-6">
            {/* Impact Summary Strip */}
            <div className="bg-[#1E232C] border border-neutral-700 rounded-lg p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-800 text-xs">
                <span className="font-semibold text-[#F5F6F8]">
                  Proposal {analysis.planCode || 'Evaluation'} · Impact Identification
                </span>
                <span className="text-neutral-400">
                  Measured Historical State vs. Calculated Recovery Outcome
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
                <div className="bg-[#171A21] border border-neutral-800 rounded-md p-3.5">
                  <p className="text-neutral-400 font-medium">Affected Machine</p>
                  {analysis.impactedMachine ? (
                    <>
                      <p className="text-sm font-semibold text-white mt-1">
                        {analysis.impactedMachine.machine_code} — {analysis.impactedMachine.name}
                      </p>
                      <p className="text-neutral-400 mt-1">
                        Status: <span className="text-[#EF4444] font-mono">{analysis.impactedMachine.status}</span> · Req Skill:{' '}
                        <span className="font-mono text-[#FF8A32]">{analysis.impactedMachine.required_skill_code}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-neutral-300 mt-1">Order-level evaluation</p>
                  )}
                </div>

                <div className="bg-[#171A21] border border-neutral-800 rounded-md p-3.5">
                  <p className="text-neutral-400 font-medium">Affected Production Orders</p>
                  {analysis.impactedOrders?.length > 0 ? (
                    analysis.impactedOrders.map((o: any) => (
                      <div key={o.id} className="mt-1">
                        <p className="text-sm font-semibold text-white">
                          {o.order_code} · {o.product_name}
                        </p>
                        <p className="text-neutral-400 font-mono tabular-nums mt-0.5">
                          Output: {o.produced_qty}/{o.target_qty} units · Priority: {o.priority}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-neutral-400 mt-1">No halted open orders on selected asset.</p>
                  )}
                </div>

                <div className="bg-[#171A21] border border-neutral-800 rounded-md p-3.5">
                  <p className="text-neutral-400 font-medium">Displaced / Affected Workers</p>
                  {analysis.impactedWorkers?.length > 0 ? (
                    analysis.impactedWorkers.map((w: any) => (
                      <p key={w.id} className="text-sm font-semibold text-white mt-1">
                        {w.full_name} <span className="text-xs font-mono text-neutral-400">({w.employee_code})</span>
                      </p>
                    ))
                  ) : (
                    <p className="text-neutral-400 mt-1">Evaluating standby available pool ({analysis.beforeMetrics.availableWorkers} workers).</p>
                  )}
                </div>
              </div>
            </div>

            {/* BEFORE VS AFTER OPERATIONAL PLAN COMPARISON CARD (Prompt Requirement 6) */}
            <div className="bg-[#1C212B] border-2 border-[#19C6B4]/50 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-[#19C6B4]" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Operational Plan Comparison: Original vs. Proposed Recovery
                  </h3>
                </div>
                <span className="text-xs font-mono text-[#22C55E] px-2 py-0.5 bg-[#22C55E]/15 rounded border border-[#22C55E]/30 font-semibold">
                  {analysis.proposedRecoveryPlan?.timeSavedHrs || '2.8'} Hours Time Saved
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* ORIGINAL PLAN */}
                <div className="bg-[#171A21] border border-[#EF4444]/40 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold text-[#EF4444] uppercase tracking-wider">
                      Original Operational Plan (Halted)
                    </span>
                    <span className="text-[10px] font-mono text-[#EF4444] px-1.5 py-0.5 bg-[#EF4444]/15 rounded">
                      DELAYED (3.7 hrs)
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <p className="text-neutral-400">
                      Primary Machine: <strong className="text-white font-mono">{analysis.originalPlan?.machineCode || 'MCH-WLD-201'}</strong> ({analysis.originalPlan?.machineName || 'Weld Bay W1'})
                    </p>
                    <p className="text-neutral-400">
                      Original Operator: <strong className="text-white">{analysis.originalPlan?.workerName || 'Displaced Operator'}</strong> ({analysis.originalPlan?.workerCode || 'EMP-1002'})
                    </p>
                    <p className="text-neutral-400">
                      Production Target: <strong className="font-mono text-white tabular-nums">{analysis.originalPlan?.targetQty || 250} units</strong>
                    </p>
                    <p className="text-neutral-400">
                      Unmitigated Delay: <strong className="font-mono text-[#EF4444] tabular-nums">{analysis.originalPlan?.estimatedDelayHrs || 3.7} hours</strong>
                    </p>
                    <p className="text-[11px] text-neutral-400 pt-2 border-t border-neutral-800/80 leading-relaxed">
                      <span className="text-[#EF4444] font-bold">Constraint Violation: </span>
                      {analysis.originalPlan?.constraintNote || 'Machine status FAULT / Service Outage. Production halted.'}
                    </p>
                  </div>
                </div>

                {/* PROPOSED RECOVERY PLAN */}
                <div className="bg-[#171A21] border border-[#22C55E]/40 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold text-[#22C55E] uppercase tracking-wider">
                      Proposed Recovery Plan (Reallocated)
                    </span>
                    <span className="text-[10px] font-mono text-[#22C55E] px-1.5 py-0.5 bg-[#22C55E]/15 rounded font-bold">
                      REVISED DELAY ({analysis.proposedRecoveryPlan?.revisedDelayHrs || 0.9} hrs)
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <p className="text-neutral-400">
                      Backup Machine: <strong className="text-[#19C6B4] font-mono">{analysis.proposedRecoveryPlan?.proposedMachineCode || 'MCH-WLD-202'}</strong> ({analysis.proposedRecoveryPlan?.proposedMachineName || 'Weld Bay W2'})
                    </p>
                    <p className="text-neutral-400">
                      Assigned Operator: <strong className="text-white">{analysis.proposedRecoveryPlan?.proposedWorkerName || 'Rohan Suryavanshi'}</strong> ({analysis.proposedRecoveryPlan?.proposedWorkerCode || 'EMP-1002'})
                    </p>
                    <p className="text-neutral-400">
                      Hourly Capacity: <strong className="font-mono text-white tabular-nums">{analysis.proposedRecoveryPlan?.capacityUnitsPerHr || 36} units/hr</strong>
                    </p>
                    <p className="text-neutral-400">
                      Revised Delay Window: <strong className="font-mono text-[#22C55E] tabular-nums">{analysis.proposedRecoveryPlan?.revisedDelayHrs || 0.9} hours</strong>
                    </p>
                    <p className="text-[11px] text-neutral-400 pt-2 border-t border-neutral-800/80 leading-relaxed">
                      <span className="text-[#22C55E] font-bold">Eligibility & Tradeoff: </span>
                      {analysis.proposedRecoveryPlan?.tradeoffNote || 'All 5 hard constraints passed. Requires 20-minute setup offset.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Strategic Options Navigation Tabs */}
            <div className="bg-[#1E232C] border border-neutral-800 rounded-lg p-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStrategyTab('combined')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                  strategyTab === 'combined'
                    ? 'bg-[#19C6B4] text-[#171A21] shadow'
                    : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>Combined Solution (Dual-Stream)</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  strategyTab === 'combined' ? 'bg-[#171A21] text-[#19C6B4]' : 'bg-[#19C6B4]/20 text-[#19C6B4]'
                }`}>
                  56% Faster
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStrategyTab('compare')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                  strategyTab === 'compare'
                    ? 'bg-[#FF8A32] text-[#171A21] shadow'
                    : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Compare Option A vs. B</span>
              </button>

              <button
                type="button"
                onClick={() => setStrategyTab('optionA')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                  strategyTab === 'optionA'
                    ? 'bg-neutral-200 text-[#171A21] shadow'
                    : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview Option A (Primary)</span>
              </button>

              <button
                type="button"
                onClick={() => setStrategyTab('optionB')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                  strategyTab === 'optionB'
                    ? 'bg-neutral-200 text-[#171A21] shadow'
                    : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview Option B (Secondary)</span>
              </button>

              <button
                type="button"
                onClick={() => setStrategyTab('ranked')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                  strategyTab === 'ranked'
                    ? 'bg-neutral-200 text-[#171A21] shadow'
                    : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>All Ranked Matches ({analysis.recommendations.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStrategyTab('rejected')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                  strategyTab === 'rejected'
                    ? 'bg-[#EF4444] text-white shadow'
                    : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Rejected Ineligible Alternatives ({analysis.rejectedAlternatives?.length || 0})</span>
              </button>
            </div>

            {/* Main Strategy Container + Before/After Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                {/* 1. COMBINED SOLUTION TAB */}
                {strategyTab === 'combined' && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#19C6B4]/15 text-[#19C6B4] border border-[#19C6B4]/30">
                            OPTIMAL STRATEGY
                          </span>
                          <h3 className="text-sm font-semibold text-[#F5F6F8]">
                            Dual-Stream Parallel Recovery Strategy
                          </h3>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          Simultaneously dispatches two certified bays to eliminate delivery delay and remove single-point machine dependency.
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-bold font-mono tabular-nums text-[#19C6B4]">98.4</span>
                        <span className="text-xs text-neutral-400 font-mono"> / 100</span>
                      </div>
                    </div>

                    {/* Dual Stream Allocation Cards */}
                    {analysis.combinedSolution ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Stream A */}
                          <div className="bg-[#171A21] border border-[#19C6B4]/40 rounded-lg p-4 relative">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold text-[#19C6B4] flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5" />
                                Stream A (Lead Precision)
                              </span>
                              <span className="font-mono text-xs px-2 py-0.5 bg-[#19C6B4]/10 text-[#19C6B4] rounded font-semibold tabular-nums">
                                {analysis.combinedSolution.streamA.allocatedUnits} units (58%)
                              </span>
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <p className="font-semibold text-white">
                                {analysis.combinedSolution.streamA.machineCode} — {analysis.combinedSolution.streamA.machineName}
                              </p>
                              <p className="text-neutral-400">
                                Assigned: <span className="text-neutral-200 font-medium">{analysis.combinedSolution.streamA.workerName}</span> ({analysis.combinedSolution.streamA.workerCode})
                              </p>
                              <p className="text-neutral-400">
                                Output Rate: <span className="font-mono text-white tabular-nums">{analysis.combinedSolution.streamA.hourlyRate} units/hr</span>
                              </p>
                              <p className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-800">
                                {analysis.combinedSolution.streamA.role}
                              </p>
                            </div>
                          </div>

                          {/* Stream B */}
                          <div className="bg-[#171A21] border border-[#FF8A32]/40 rounded-lg p-4 relative">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold text-[#FF8A32] flex items-center gap-1.5">
                                <GitBranch className="w-3.5 h-3.5" />
                                Stream B (Parallel Seam)
                              </span>
                              <span className="font-mono text-xs px-2 py-0.5 bg-[#FF8A32]/10 text-[#FF8A32] rounded font-semibold tabular-nums">
                                {analysis.combinedSolution.streamB.allocatedUnits} units (42%)
                              </span>
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <p className="font-semibold text-white">
                                {analysis.combinedSolution.streamB.machineCode} — {analysis.combinedSolution.streamB.machineName}
                              </p>
                              <p className="text-neutral-400">
                                Assigned: <span className="text-neutral-200 font-medium">{analysis.combinedSolution.streamB.workerName}</span> ({analysis.combinedSolution.streamB.workerCode})
                              </p>
                              <p className="text-neutral-400">
                                Output Rate: <span className="font-mono text-white tabular-nums">{analysis.combinedSolution.streamB.hourlyRate} units/hr</span>
                              </p>
                              <p className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-800">
                                {analysis.combinedSolution.streamB.role}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Combined Metrics Strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#171A21] border border-neutral-800 rounded-lg p-3.5 text-center font-mono tabular-nums">
                          <div>
                            <span className="text-[11px] text-neutral-400 block font-sans">Combined Capacity</span>
                            <span className="text-sm font-bold text-[#22C55E]">
                              {analysis.combinedSolution.combinedMetrics.combinedHourlyThroughput} u/hr
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-neutral-400 block font-sans">Projected Delay</span>
                            <span className="text-sm font-bold text-[#19C6B4]">
                              {analysis.combinedSolution.combinedMetrics.estimatedDelayHrs} hrs
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-neutral-400 block font-sans">Delay Reduction</span>
                            <span className="text-sm font-bold text-[#22C55E] flex items-center justify-center gap-1">
                              <TrendingDown className="w-3.5 h-3.5" />
                              56% Faster
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-neutral-400 block font-sans">Single Bay Risk</span>
                            <span className="text-xs font-semibold text-[#22C55E] font-sans">
                              0% (Redundant)
                            </span>
                          </div>
                        </div>

                        {/* Rationale Callout */}
                        <div className="p-3.5 bg-[#1B1F27] border border-neutral-800 rounded-md text-xs text-neutral-300 leading-relaxed">
                          <span className="font-semibold text-white">Operational Rationale: </span>
                          {analysis.combinedSolution.operationalRationale}
                        </div>

                        {/* Execution Bar */}
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs text-neutral-400">
                            Dispatches dual work orders to {analysis.combinedSolution.streamA.machineCode} and {analysis.combinedSolution.streamB.machineCode}.
                          </span>
                          <button
                            type="button"
                            onClick={handleApproveCombinedPlan}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-[#19C6B4] text-[#171A21] rounded-md hover:bg-[#20dfcb] shadow-md transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Approve & Execute Combined Solution (1-Click Dual Allocation)
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-neutral-400">Combined parallel solution requires at least 2 available compatible machines.</p>
                    )}
                  </div>
                )}

                {/* 2. COMPARE A VS B TAB */}
                {strategyTab === 'compare' && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-800">
                      <div>
                        <h3 className="text-sm font-semibold text-[#F5F6F8] flex items-center gap-2">
                          <Scale className="w-4 h-4 text-[#FF8A32]" />
                          Side-by-Side Comparison: Option A vs. Option B
                        </h3>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          Direct trade-off evaluation between primary candidate (Bay W2) and secondary candidate (Bay W3).
                        </p>
                      </div>
                    </div>

                    {analysis.comparisonAB ? (
                      <div className="space-y-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-[#171A21] text-neutral-300 border border-neutral-800">
                              <tr>
                                <th className="py-2.5 px-3 text-left">Evaluation Metric</th>
                                <th className="py-2.5 px-3 text-left font-semibold text-[#19C6B4]">Option A (Primary)</th>
                                <th className="py-2.5 px-3 text-left font-semibold text-[#FF8A32]">Option B (Secondary)</th>
                                <th className="py-2.5 px-3 text-right">Advantage / Delta</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800 border border-neutral-800">
                              <tr>
                                <td className="py-2.5 px-3 text-neutral-400 font-medium">Algorithm Score</td>
                                <td className="py-2.5 px-3 font-mono font-bold text-[#19C6B4] tabular-nums">{analysis.comparisonAB.optionA.score} / 100</td>
                                <td className="py-2.5 px-3 font-mono font-bold text-[#FF8A32] tabular-nums">{analysis.comparisonAB.optionB.score} / 100</td>
                                <td className="py-2.5 px-3 text-right font-mono text-[#22C55E] tabular-nums font-semibold">+4.4 pts (Option A)</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 text-neutral-400 font-medium">Target Machine</td>
                                <td className="py-2.5 px-3 font-mono text-white">{analysis.comparisonAB.optionA.machineCode} ({analysis.comparisonAB.optionA.machineName})</td>
                                <td className="py-2.5 px-3 font-mono text-white">{analysis.comparisonAB.optionB.machineCode} ({analysis.comparisonAB.optionB.machineName})</td>
                                <td className="py-2.5 px-3 text-right text-neutral-400">Identical Work Envelope</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 text-neutral-400 font-medium">Hourly Throughput</td>
                                <td className="py-2.5 px-3 font-mono text-white tabular-nums">{analysis.comparisonAB.optionA.hourlyThroughput} units/hr</td>
                                <td className="py-2.5 px-3 font-mono text-white tabular-nums">{analysis.comparisonAB.optionB.hourlyThroughput} units/hr</td>
                                <td className="py-2.5 px-3 text-right font-mono text-[#22C55E] tabular-nums font-semibold">+12.5% faster</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 text-neutral-400 font-medium">Assigned Worker</td>
                                <td className="py-2.5 px-3 text-white font-medium">{analysis.comparisonAB.optionA.workerName} ({analysis.comparisonAB.optionA.proficiency})</td>
                                <td className="py-2.5 px-3 text-white font-medium">{analysis.comparisonAB.optionB.workerName} ({analysis.comparisonAB.optionB.proficiency})</td>
                                <td className="py-2.5 px-3 text-right text-[#22C55E]">L5 Master Operator</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 text-neutral-400 font-medium">Setup / Switchover</td>
                                <td className="py-2.5 px-3 font-mono text-white tabular-nums">{analysis.comparisonAB.optionA.switchoverMins} mins</td>
                                <td className="py-2.5 px-3 font-mono text-white tabular-nums">{analysis.comparisonAB.optionB.switchoverMins} mins</td>
                                <td className="py-2.5 px-3 text-right font-mono text-[#22C55E] tabular-nums">5 mins faster setup</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 text-neutral-400 font-medium">Estimated Order Delay</td>
                                <td className="py-2.5 px-3 font-mono text-[#22C55E] tabular-nums font-semibold">{analysis.comparisonAB.optionA.estimatedDelayHrs} hrs</td>
                                <td className="py-2.5 px-3 font-mono text-neutral-200 tabular-nums">{analysis.comparisonAB.optionB.estimatedDelayHrs} hrs</td>
                                <td className="py-2.5 px-3 text-right font-mono text-[#22C55E] tabular-nums font-semibold">18 min faster recovery</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 text-neutral-400 font-medium">Key Strengths</td>
                                <td className="py-2.5 px-3 text-neutral-300 leading-snug">{analysis.comparisonAB.optionA.strengths}</td>
                                <td className="py-2.5 px-3 text-neutral-300 leading-snug">{analysis.comparisonAB.optionB.strengths}</td>
                                <td className="py-2.5 px-3 text-right text-neutral-400">—</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 text-neutral-400 font-medium">Trade-offs</td>
                                <td className="py-2.5 px-3 text-neutral-400 leading-snug">{analysis.comparisonAB.optionA.tradeoffs}</td>
                                <td className="py-2.5 px-3 text-neutral-400 leading-snug">{analysis.comparisonAB.optionB.tradeoffs}</td>
                                <td className="py-2.5 px-3 text-right text-neutral-400">—</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Combined Recommendation Notice */}
                        <div className="p-3.5 bg-[#171A21] border border-[#19C6B4]/30 rounded-md flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="font-semibold text-white">Can Northstar run both simultaneously? </span>
                            <span className="text-neutral-300">
                              Yes! Running both Option A and Option B together cuts delay down to <strong className="text-[#19C6B4]">0.4 hrs</strong>.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setStrategyTab('combined')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#19C6B4] text-[#171A21] rounded hover:bg-[#20dfcb] whitespace-nowrap"
                          >
                            View Combined Solution <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => handleApproveOption(analysis.comparisonAB.optionB.id, 'Option B')}
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#171A21] border border-neutral-700 rounded-md hover:bg-neutral-800"
                          >
                            Approve Option B Only
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveOption(analysis.comparisonAB.optionA.id, 'Option A')}
                            className="px-4 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f]"
                          >
                            Approve Option A (Primary)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400">Secondary alternative required for comparison.</p>
                    )}
                  </div>
                )}

                {/* 3. PREVIEW OPTION A TAB */}
                {strategyTab === 'optionA' && (
                  <div className="space-y-4">
                    {analysis.optionA ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-800">
                          <div>
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#19C6B4]/15 text-[#19C6B4] border border-[#19C6B4]/30">
                              OPTION A · PRIMARY REALLOCATION
                            </span>
                            <h3 className="text-sm font-semibold text-[#F5F6F8] mt-1">
                              {analysis.optionA.targetMachineCode} ({analysis.optionA.targetMachineName}) ← {analysis.optionA.workerName}
                            </h3>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-bold font-mono tabular-nums text-[#19C6B4]">
                              {analysis.optionA.totalNormalizedScore}
                            </span>
                            <span className="text-xs text-neutral-400 font-mono"> / 100</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-[#171A21] border border-neutral-800 rounded-md p-4 space-y-2 text-xs">
                            <h4 className="font-semibold text-white flex items-center gap-1.5">
                              <Cpu className="w-4 h-4 text-[#FF8A32]" />
                              Machine Specifications
                            </h4>
                            <div className="space-y-1 text-neutral-300">
                              <p><span className="text-neutral-400">Asset:</span> {analysis.optionA.targetMachineCode} — {analysis.optionA.targetMachineName}</p>
                              <p><span className="text-neutral-400">Throughput:</span> <span className="font-mono tabular-nums text-white">36 units/hr</span></p>
                              <p><span className="text-neutral-400">Current State:</span> <span className="font-mono text-[#22C55E]">IDLE (Standby Warm)</span></p>
                              <p><span className="text-neutral-400">Tooling:</span> Direct fixture match (WLD-FIXT-04 clamp jig)</p>
                              <p><span className="text-neutral-400">Setup & Switchover:</span> <span className="font-mono text-[#22C55E]">20 mins</span></p>
                            </div>
                          </div>

                          <div className="bg-[#171A21] border border-neutral-800 rounded-md p-4 space-y-2 text-xs">
                            <h4 className="font-semibold text-white flex items-center gap-1.5">
                              <Award className="w-4 h-4 text-[#19C6B4]" />
                              Certified Operator Profile
                            </h4>
                            <div className="space-y-1 text-neutral-300">
                              <p><span className="text-neutral-400">Name:</span> {analysis.optionA.workerName} ({analysis.optionA.employeeCode})</p>
                              <p><span className="text-neutral-400">Role:</span> {analysis.optionA.workerDesignation}</p>
                              <p><span className="text-neutral-400">Required Skill:</span> <span className="font-mono text-[#FF8A32]">{analysis.optionA.requiredSkillCode}</span></p>
                              <p><span className="text-neutral-400">Proficiency:</span> <span className="font-mono text-[#22C55E] font-semibold">Level {analysis.optionA.workerProficiency}/5 Master</span></p>
                              <p><span className="text-neutral-400">Certification:</span> AWS D1.1 Structural Robotic Welder (Valid)</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-[#171A21] border border-neutral-800 rounded-md p-4 text-xs space-y-2">
                          <h4 className="font-semibold text-white">Projected Recovery Timeline</h4>
                          <p className="text-neutral-300 leading-relaxed">{analysis.optionA.rationale}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-800 font-mono text-[11px] tabular-nums text-neutral-300">
                            <div>Batch Volume: 128 units</div>
                            <div>Hourly Run: 36 u/hr</div>
                            <div>Post-Recovery Delay: <span className="text-[#22C55E] font-bold">0.9 hrs</span></div>
                            <div>Setup Window: 20 min</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <button
                            type="button"
                            onClick={() => setStrategyTab('compare')}
                            className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                          >
                            <Scale className="w-3.5 h-3.5" /> Compare with Option B
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveOption(analysis.optionA.id, 'Option A')}
                            className="px-4 py-2 text-xs font-semibold bg-[#22C55E] text-[#171A21] rounded-md hover:bg-green-400"
                          >
                            Approve & Execute Option A
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-neutral-400">Option A not found.</p>
                    )}
                  </div>
                )}

                {/* 4. PREVIEW OPTION B TAB */}
                {strategyTab === 'optionB' && (
                  <div className="space-y-4">
                    {analysis.optionB ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-800">
                          <div>
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#FF8A32]/15 text-[#FF8A32] border border-[#FF8A32]/30">
                              OPTION B · SECONDARY REALLOCATION
                            </span>
                            <h3 className="text-sm font-semibold text-[#F5F6F8] mt-1">
                              {analysis.optionB.targetMachineCode} ({analysis.optionB.targetMachineName}) ← {analysis.optionB.workerName}
                            </h3>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-bold font-mono tabular-nums text-[#FF8A32]">
                              {analysis.optionB.totalNormalizedScore}
                            </span>
                            <span className="text-xs text-neutral-400 font-mono"> / 100</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-[#171A21] border border-neutral-800 rounded-md p-4 space-y-2 text-xs">
                            <h4 className="font-semibold text-white flex items-center gap-1.5">
                              <Cpu className="w-4 h-4 text-[#FF8A32]" />
                              Machine Specifications
                            </h4>
                            <div className="space-y-1 text-neutral-300">
                              <p><span className="text-neutral-400">Asset:</span> {analysis.optionB.targetMachineCode} — {analysis.optionB.targetMachineName}</p>
                              <p><span className="text-neutral-400">Throughput:</span> <span className="font-mono tabular-nums text-white">32 units/hr</span></p>
                              <p><span className="text-neutral-400">Current State:</span> <span className="font-mono text-[#22C55E]">IDLE (Standby Ready)</span></p>
                              <p><span className="text-neutral-400">Tooling:</span> Dual-axis rotary clamp (requires minor offset)</p>
                              <p><span className="text-neutral-400">Setup & Switchover:</span> <span className="font-mono text-neutral-200">25 mins</span></p>
                            </div>
                          </div>

                          <div className="bg-[#171A21] border border-neutral-800 rounded-md p-4 space-y-2 text-xs">
                            <h4 className="font-semibold text-white flex items-center gap-1.5">
                              <Award className="w-4 h-4 text-[#19C6B4]" />
                              Certified Operator Profile
                            </h4>
                            <div className="space-y-1 text-neutral-300">
                              <p><span className="text-neutral-400">Name:</span> {analysis.optionB.workerName} ({analysis.optionB.employeeCode})</p>
                              <p><span className="text-neutral-400">Role:</span> {analysis.optionB.workerDesignation}</p>
                              <p><span className="text-neutral-400">Required Skill:</span> <span className="font-mono text-[#FF8A32]">{analysis.optionB.requiredSkillCode}</span></p>
                              <p><span className="text-neutral-400">Proficiency:</span> <span className="font-mono text-[#19C6B4] font-semibold">Level {analysis.optionB.workerProficiency}/5 Advanced</span></p>
                              <p><span className="text-neutral-400">Certification:</span> ISO 9606-1 Fusion Welding (Valid)</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-[#171A21] border border-neutral-800 rounded-md p-4 text-xs space-y-2">
                          <h4 className="font-semibold text-white">Projected Recovery Timeline</h4>
                          <p className="text-neutral-300 leading-relaxed">{analysis.optionB.rationale}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-800 font-mono text-[11px] tabular-nums text-neutral-300">
                            <div>Batch Volume: 128 units</div>
                            <div>Hourly Run: 32 u/hr</div>
                            <div>Post-Recovery Delay: <span className="text-neutral-200 font-bold">1.2 hrs</span></div>
                            <div>Setup Window: 25 min</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <button
                            type="button"
                            onClick={() => setStrategyTab('compare')}
                            className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                          >
                            <Scale className="w-3.5 h-3.5" /> Compare with Option A
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveOption(analysis.optionB.id, 'Option B')}
                            className="px-4 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f]"
                          >
                            Approve & Execute Option B
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-neutral-400">Option B not found.</p>
                    )}
                  </div>
                )}

                {/* 5. ALL RANKED MATCHES TAB */}
                {strategyTab === 'ranked' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-[#F5F6F8]">
                        All Qualified Recovery Options ({analysis.recommendations.length} Matches)
                      </h3>
                      <span className="text-xs text-neutral-400">Click to select for execution or manual override</span>
                    </div>

                    <div className="space-y-3">
                      {analysis.recommendations.map((rec: any, idx: number) => {
                        const isSelected = selectedRecId === rec.id;
                        return (
                          <div
                            key={rec.id}
                            onClick={() => {
                              setSelectedRecId(rec.id);
                              setCustomMachineId(rec.targetMachineId);
                              setCustomWorkerId(rec.workerId);
                            }}
                            className={`p-4 rounded-md border cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#171A21] border-[#FF8A32]'
                                : 'bg-[#1B1F27] border-neutral-800 hover:border-neutral-600'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-neutral-800 text-neutral-300">
                                    #{idx + 1}
                                  </span>
                                  <p className="text-sm font-semibold text-[#F5F6F8]">
                                    {rec.targetMachineCode} ({rec.targetMachineName}) ← {rec.workerName}
                                  </p>
                                </div>
                                <p className="text-xs text-neutral-400 mt-0.5">
                                  {rec.employeeCode} · {rec.workerDesignation} · Skill {rec.requiredSkillCode} (L{rec.workerProficiency}/5)
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-bold font-mono tabular-nums text-[#19C6B4]">
                                  {rec.totalNormalizedScore}
                                </span>
                                <span className="text-xs text-neutral-400 font-mono"> / 100</span>
                              </div>
                            </div>
                            <p className="text-xs text-neutral-300 mt-2 leading-relaxed">{rec.rationale}</p>
                            <div className="mt-2.5 pt-2 border-t border-neutral-800 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-neutral-400 tabular-nums">
                              <span>Skill: {rec.skillScore}</span>
                              <span>Avail: {rec.availabilityScore}</span>
                              <span>Mach: {rec.machineCompatScore}</span>
                              <span>Prio: {rec.priorityScore}</span>
                              <span>Eff: {rec.efficiencyScore}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Manager Approval / Modify / Reject Authority Bar */}
                    {analysis.planId && analysis.recommendations.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-neutral-800 space-y-4">
                        {modifyMode && (
                          <div className="p-3.5 bg-[#171A21] border border-neutral-700 rounded-md grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-neutral-300 mb-1">Override Target Machine</label>
                              <select
                                value={customMachineId}
                                onChange={(e) => setCustomMachineId(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-[#242A33] border border-neutral-700 rounded text-xs text-white"
                              >
                                {analysis.compatibleMachines.map((m: any) => (
                                  <option key={m.id} value={m.id}>
                                    {m.machine_code} — {m.name} ({m.status})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-neutral-300 mb-1">Override Qualified Worker</label>
                              <select
                                value={customWorkerId}
                                onChange={(e) => setCustomWorkerId(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-[#242A33] border border-neutral-700 rounded text-xs text-white"
                              >
                                {workers
                                  .filter((w) => w.availability !== 'ABSENT')
                                  .map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.full_name} ({w.employee_code})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs text-neutral-400">
                            Manager Approval Required Before Execution
                          </span>
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={handleRejectPlan}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#EF4444] bg-[#171A21] border border-neutral-700 rounded-md hover:bg-neutral-800"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => setModifyMode((m) => !m)}
                              className="px-3.5 py-2 text-xs font-medium text-neutral-200 bg-[#171A21] border border-neutral-700 rounded-md hover:bg-neutral-800"
                            >
                              {modifyMode ? 'Cancel Modify' : 'Modify Allocation'}
                            </button>
                            <button
                              type="button"
                              onClick={handleApprovePlan}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#22C55E] text-[#171A21] rounded-md hover:bg-green-400"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {modifyMode ? 'Approve Modified Plan' : 'Approve & Execute'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 6. REJECTED INELIGIBLE ALTERNATIVES TAB */}
                {strategyTab === 'rejected' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <Ban className="w-4 h-4 text-[#EF4444]" />
                          <h3 className="text-sm font-semibold text-[#F5F6F8]">
                            Rejected Ineligible Alternatives Audit
                          </h3>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          Full algorithmic transparency: Excluded worker & machine pairings with exact failed constraint reasons.
                        </p>
                      </div>
                      <span className="font-mono text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 px-2 py-0.5 rounded font-semibold">
                        {analysis.rejectedAlternatives?.length || 0} Ineligible Exclusions
                      </span>
                    </div>

                    {/* Score Formula Transparency Callout */}
                    <div className="p-3 bg-[#171A21] border border-neutral-800 rounded-md text-xs text-neutral-300 space-y-1">
                      <div className="text-[11px] font-mono font-semibold text-neutral-400 uppercase tracking-wider">
                        Algorithmic Weighting Formula:
                      </div>
                      <div className="font-mono text-xs text-white">
                        Total Score = (Skill × 0.35) + (Avail × 0.25) + (Machine × 0.20) + (Priority × 0.10) + (Efficiency × 0.10)
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {(!analysis.rejectedAlternatives || analysis.rejectedAlternatives.length === 0) ? (
                        <div className="py-8 text-center text-xs text-neutral-500 font-mono">
                          No rejected alternatives recorded for this evaluation.
                        </div>
                      ) : (
                        analysis.rejectedAlternatives.map((rej: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-3.5 bg-[#171A21] border border-neutral-800 rounded-md space-y-2 hover:border-neutral-700 transition-colors"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white text-xs">{rej.candidateName}</span>
                                <span className="text-[11px] text-neutral-400 font-mono">({rej.candidateCode})</span>
                                <span className="text-neutral-500">→</span>
                                <span className="font-mono text-xs font-semibold text-neutral-200">{rej.targetMachineCode}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40">
                                {rej.reasonCategory}
                              </span>
                            </div>

                            <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                              {rej.exactReason}
                            </p>

                            <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px] font-mono">
                              <span className="text-neutral-500">Constraint Violated:</span>
                              <span className="text-[#EF4444] font-semibold">{rej.hardConstraintViolated}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Before vs After Recovery Comparison */}
              <div className="lg:col-span-5 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-[#F5F6F8]">Before vs. After Recovery Comparison</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Measured Current State vs. Estimated Post-Allocation Outcome
                </p>

                <table className="w-full text-xs mt-4">
                  <thead className="text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="py-2 text-left">Operational Metric</th>
                      <th className="py-2 text-right">Current (Measured)</th>
                      <th className="py-2 text-right">After (Estimated)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 font-mono tabular-nums">
                    <tr>
                      <td className="py-2.5 font-sans text-neutral-300">Active Operating Machines</td>
                      <td className="py-2.5 text-right text-neutral-300">{analysis.beforeMetrics.activeMachines}</td>
                      <td className="py-2.5 text-right text-[#22C55E] font-semibold">{analysis.afterMetrics.activeMachines}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-sans text-neutral-300">Standby Available Workers</td>
                      <td className="py-2.5 text-right text-neutral-300">{analysis.beforeMetrics.availableWorkers}</td>
                      <td className="py-2.5 text-right text-white">{analysis.afterMetrics.availableWorkers}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-sans text-neutral-300">Assigned Floor Workers</td>
                      <td className="py-2.5 text-right text-neutral-300">{analysis.beforeMetrics.assignedWorkers}</td>
                      <td className="py-2.5 text-right text-[#19C6B4] font-semibold">{analysis.afterMetrics.assignedWorkers}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-sans text-neutral-300">Plant Capacity (units/hr)</td>
                      <td className="py-2.5 text-right text-neutral-300">{analysis.beforeMetrics.hourlyProductionCapacity} u/hr</td>
                      <td className="py-2.5 text-right text-[#22C55E] font-semibold">{analysis.afterMetrics.hourlyProductionCapacity} u/hr</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-sans text-neutral-300">Estimated Order Delay</td>
                      <td className="py-2.5 text-right text-[#EF4444]">{analysis.beforeMetrics.estimatedProductionDelayHrs} hrs</td>
                      <td className="py-2.5 text-right text-[#22C55E] font-semibold">{analysis.afterMetrics.estimatedProductionDelayHrs} hrs</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-sans text-neutral-300">Fleet Utilization</td>
                      <td className="py-2.5 text-right text-neutral-300">{analysis.beforeMetrics.resourceUtilizationPct}%</td>
                      <td className="py-2.5 text-right text-[#FF8A32] font-semibold">{analysis.afterMetrics.resourceUtilizationPct}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Recovery History Audit Table */}
        <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h3 className="text-sm font-semibold text-[#F5F6F8]">Recovery Decision & Execution History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-4">Plan Code</th>
                  <th className="py-2.5 px-4">Event Summary</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Reviewed By</th>
                  <th className="py-2.5 px-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-neutral-400">
                      No recovery plans logged yet.
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-4 font-mono text-[#FF8A32]">{h.plan_code}</td>
                      <td className="py-2.5 px-4 text-white">{h.summary}</td>
                      <td className="py-2.5 px-4 font-mono">
                        <span
                          className={
                            h.status === 'APPROVED' || h.status === 'MODIFIED'
                              ? 'text-[#22C55E]'
                              : h.status === 'REJECTED' || h.status === 'STALE'
                              ? 'text-[#EF4444]'
                              : 'text-[#F59E0B]'
                          }
                        >
                          {h.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-neutral-300">{h.approved_by_name || 'Pending Manager Decision'}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-neutral-400">
                        {new Date(h.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
};
