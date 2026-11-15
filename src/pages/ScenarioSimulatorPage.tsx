import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ArrowRightLeft, GitBranch } from 'lucide-react';
import { DashboardShell } from '../components/DashboardShell';
import { MANAGER_NAV_ITEMS } from './RecoveryEnginePage';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';

const SCENARIO_TYPES = [
  { id: 'MACHINE_FAILURE', label: '1. Machine Failure', desc: 'Simulate spindle/servo breakdown & downtime window' },
  { id: 'WORKER_ABSENCE', label: '2. Worker Absence', desc: 'Evaluate unplanned absence of an assigned operator' },
  { id: 'DEMAND_INCREASE', label: '3. Demand Increase', desc: 'Test surge production target against plant capacity' },
  { id: 'SCHEDULED_MAINTENANCE', label: '4. Scheduled Maintenance', desc: 'Assess planned bay outage before locking calendar' },
  { id: 'PRODUCTION_DELAY', label: '5. Production Delay', desc: 'Evaluate catch-up allocations for delayed orders' },
];

export const ScenarioSimulatorPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [machines, setMachines] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [simulations, setSimulations] = useState<any[]>([]);

  const [scenarioType, setScenarioType] = useState('MACHINE_FAILURE');
  const [scenarioName, setScenarioName] = useState('CNC-101 Spindle Breakdown Stress Test');
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [failureType, setFailureType] = useState('Spindle Bearing Thermal Trip');
  const [downtimeHrs, setDowntimeHrs] = useState(6);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [additionalUnits, setAdditionalUnits] = useState(250);
  const [durationHrs, setDurationHrs] = useState(4);

  const [activeResult, setActiveResult] = useState<any>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const loadSimulatorData = useCallback(async () => {
    try {
      const [mRes, wRes, oRes, sRes] = await Promise.all([
        apiFetch('/api/machines'),
        apiFetch('/api/workers'),
        apiFetch('/api/production/orders'),
        apiFetch('/api/simulations'),
      ]);
      setMachines(mRes.machines);
      setWorkers(wRes.workers);
      setOrders(oRes.orders);
      setSimulations(sRes.simulations);

      if (mRes.machines[0] && !selectedMachineId) setSelectedMachineId(mRes.machines[0].id);
      if (wRes.workers[0] && !selectedWorkerId) setSelectedWorkerId(wRes.workers[0].id);
      if (oRes.orders[0] && !selectedOrderId) setSelectedOrderId(oRes.orders[0].id);
    } catch (err: any) {
      notify('error', 'Failed to load simulator context', err.message);
    }
  }, [notify, selectedMachineId, selectedOrderId, selectedWorkerId]);

  useEffect(() => {
    loadSimulatorData();
  }, [loadSimulatorData]);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    try {
      const parameters: Record<string, any> = {};
      if (scenarioType === 'MACHINE_FAILURE') {
        parameters.machineId = selectedMachineId;
        parameters.failureType = failureType;
        parameters.downtimeHrs = downtimeHrs;
      } else if (scenarioType === 'WORKER_ABSENCE') {
        parameters.workerId = selectedWorkerId;
      } else if (scenarioType === 'DEMAND_INCREASE') {
        parameters.orderId = selectedOrderId;
        parameters.additionalUnits = additionalUnits;
      } else if (scenarioType === 'SCHEDULED_MAINTENANCE') {
        parameters.machineId = selectedMachineId;
        parameters.durationHrs = durationHrs;
      } else {
        parameters.orderId = selectedOrderId;
      }

      const res = await apiFetch('/api/simulations', {
        method: 'POST',
        body: JSON.stringify({
          scenarioType,
          name: scenarioName,
          parameters,
        }),
      });
      setActiveResult(res);
      notify('success', 'Simulation Computed', 'Live plant records were NOT modified.');
      await loadSimulatorData();
    } catch (err: any) {
      notify('error', 'Simulation error', err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleConvertToRecoveryPlan = async (simId: string) => {
    try {
      const res = await apiFetch(`/api/simulations/${simId}/convert`, { method: 'POST' });
      notify('success', 'Converted to Recovery Proposal', res.message);
      navigate('/manager/recovery-engine');
    } catch (err: any) {
      notify('error', 'Conversion failed', err.message);
    }
  };

  const [multiCompareData, setMultiCompareData] = useState<any>(null);
  const [comparingMulti, setComparingMulti] = useState(false);

  const handleRunMultiComparison = async () => {
    setComparingMulti(true);
    try {
      const res = await apiFetch<any>('/api/scenario-simulator/compare', {
        method: 'POST',
        body: JSON.stringify({
          disruptionType: scenarioType,
          machineId: selectedMachineId,
          orderId: selectedOrderId,
          delayHours: downtimeHrs || 4,
        }),
      });
      setMultiCompareData(res);
      notify('success', 'Multi-Scenario Comparison Computed', '3 distinct recovery strategies synthesized side-by-side.');
    } catch (err: any) {
      notify('error', 'Comparison error', err.message);
    } finally {
      setComparingMulti(false);
    }
  };

  const handleConvertSelectedScenario = async (scenarioId: string) => {
    try {
      const res = await apiFetch<any>('/api/scenario-simulator/convert-to-plan', {
        method: 'POST',
        body: JSON.stringify({
          scenarioId,
          comparisonId: multiCompareData?.comparisonId,
          notes: `Simulated under ${multiCompareData?.disruptionContext?.type || scenarioType}`,
        }),
      });
      notify('success', 'Proposal Activated', `Plan ${res.planCode} generated and live in Recovery Engine.`);
      navigate('/manager/recovery-engine');
    } catch (err: any) {
      notify('error', 'Plan conversion error', err.message);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const comparedItems = simulations.filter((s) => compareIds.includes(s.id));

  return (
    <DashboardShell
      roleTitle="Factory Manager"
      accentHex="#19C6B4"
      navItems={MANAGER_NAV_ITEMS}
      activeTab="simulator"
      onSelectTab={(id) => navigate(`/manager/dashboard?tab=${id}`)}
      pageTitle="Factory Scenario Simulator"
      breadcrumbSub="Non-Destructive Snapshot Sandbox · Multi-Scenario Evaluation Matrix"
      headerActions={
        <button
          onClick={handleRunMultiComparison}
          disabled={comparingMulti}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF8A32] text-[#171A21] rounded font-semibold text-xs hover:bg-[#ff9b4f] transition-colors"
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>{comparingMulti ? 'Synthesizing...' : 'Run 3-Scenario Comparison'}</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* Scenario Type Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {SCENARIO_TYPES.map((st) => {
            const active = scenarioType === st.id;
            return (
              <button
                key={st.id}
                onClick={() => {
                  setScenarioType(st.id);
                  setScenarioName(`${st.label.slice(3)} Snapshot`);
                }}
                className={`text-left p-3.5 rounded-lg border transition-colors ${
                  active
                    ? 'bg-[#242A33] border-[#19C6B4] text-[#F5F6F8]'
                    : 'bg-[#1B1F27] border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <p className="text-xs font-semibold">{st.label}</p>
                <p className="text-[11px] text-neutral-400 mt-1 leading-snug">{st.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Parameter Input Form */}
          <div className="lg:col-span-5 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-[#F5F6F8]">Configure Hypothetical Parameters</h2>
            <p className="text-xs text-neutral-400 mt-1">
              Runs against a read-only snapshot of current Northstar Manufacturing Works database state.
            </p>

            <form onSubmit={handleRunSimulation} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs text-neutral-300 mb-1">Scenario Label</label>
                <input
                  type="text"
                  required
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                />
              </div>

              {(scenarioType === 'MACHINE_FAILURE' || scenarioType === 'SCHEDULED_MAINTENANCE') && (
                <div>
                  <label className="block text-xs text-neutral-300 mb-1">Select Machine</label>
                  <select
                    value={selectedMachineId}
                    onChange={(e) => setSelectedMachineId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                  >
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.machine_code} — {m.name} ({m.capacity_units_per_hr} u/hr)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scenarioType === 'MACHINE_FAILURE' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Failure Mode</label>
                    <input
                      type="text"
                      value={failureType}
                      onChange={(e) => setFailureType(e.target.value)}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Est. Downtime (hrs)</label>
                    <input
                      type="number"
                      min={1}
                      max={72}
                      value={downtimeHrs}
                      onChange={(e) => setDowntimeHrs(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                    />
                  </div>
                </div>
              )}

              {scenarioType === 'SCHEDULED_MAINTENANCE' && (
                <div>
                  <label className="block text-xs text-neutral-300 mb-1">Maintenance Duration (hrs)</label>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    value={durationHrs}
                    onChange={(e) => setDurationHrs(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                  />
                </div>
              )}

              {scenarioType === 'WORKER_ABSENCE' && (
                <div>
                  <label className="block text-xs text-neutral-300 mb-1">Select Unavailable Worker</label>
                  <select
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                  >
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.full_name} ({w.employee_code} · {w.department_name})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(scenarioType === 'DEMAND_INCREASE' || scenarioType === 'PRODUCTION_DELAY') && (
                <div>
                  <label className="block text-xs text-neutral-300 mb-1">Select Production Order</label>
                  <select
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs text-white"
                  >
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.order_code} — {o.product_name} ({o.produced_qty}/{o.target_qty})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scenarioType === 'DEMAND_INCREASE' && (
                <div>
                  <label className="block text-xs text-neutral-300 mb-1">Additional Surge Target Quantity</label>
                  <input
                    type="number"
                    min={20}
                    max={5000}
                    value={additionalUnits}
                    onChange={(e) => setAdditionalUnits(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-xs font-mono text-white"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={running}
                className="w-full py-2.5 px-4 text-xs font-semibold bg-[#19C6B4] text-[#171A21] rounded-md hover:bg-teal-300 inline-flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5" />
                {running ? 'Simulating Snapshot...' : 'Start Simulation'}
              </button>
            </form>
          </div>

          {/* Simulation Output Panel */}
          <div className="lg:col-span-7 bg-[#242A33] border border-neutral-800 rounded-lg p-5">
            {!activeResult ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                <p className="text-sm font-semibold text-[#F5F6F8]">No Active Scenario Selected</p>
                <p className="text-xs text-neutral-400 mt-1 max-w-md">
                  Configure any of the five operational scenarios on the left and click &ldquo;Start Simulation&rdquo; to inspect estimated delays, affected orders, and standby capacity without altering live factory records.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-800">
                  <div>
                    <p className="text-xs font-mono text-[#19C6B4]">SIMULATED SNAPSHOT OUTPUT</p>
                    <h3 className="text-base font-semibold text-[#F5F6F8]">{activeResult.name}</h3>
                  </div>
                  <button
                    onClick={() => handleConvertToRecoveryPlan(activeResult.scenarioId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f]"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Convert to Live Recovery Proposal
                  </button>
                </div>

                <div className="p-3 bg-[#171A21] border border-neutral-800 rounded text-xs text-neutral-300">
                  <span className="font-semibold text-white">Assumptions: </span>
                  {activeResult.assumptions}
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                  <div className="bg-[#171A21] border border-neutral-800 rounded p-3">
                    <p className="font-sans text-neutral-400">Unmitigated Delay</p>
                    <p className="text-lg font-bold text-[#EF4444] mt-1">{activeResult.unmitigatedDelayHrs} hrs</p>
                  </div>
                  <div className="bg-[#171A21] border border-neutral-800 rounded p-3">
                    <p className="font-sans text-neutral-400">With Backup Allocation</p>
                    <p className="text-lg font-bold text-[#22C55E] mt-1">{activeResult.mitigatedDelayHrs} hrs</p>
                  </div>
                  <div className="bg-[#171A21] border border-neutral-800 rounded p-3">
                    <p className="font-sans text-neutral-400">Eligible Options</p>
                    <p className="text-lg font-bold text-[#19C6B4] mt-1">{activeResult.recommendations?.length || 0}</p>
                  </div>
                </div>

                {activeResult.recommendations?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-neutral-300 mb-2">Simulated Recovery Allocations:</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {activeResult.recommendations.slice(0, 3).map((r: any) => (
                        <div key={r.id} className="p-3 bg-[#171A21] border border-neutral-800 rounded text-xs flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-white">
                              {r.targetMachineCode} ← {r.workerName} ({r.requiredSkillCode})
                            </p>
                            <p className="text-neutral-400 text-[11px] mt-0.5">{r.rationale}</p>
                          </div>
                          <span className="font-mono font-bold text-[#19C6B4] ml-3 shrink-0">
                            {r.totalNormalizedScore}/100
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scenario Comparison Matrix */}
        {comparedItems.length === 2 && (
          <div className="bg-[#1E232C] border border-[#19C6B4]/50 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-[#F5F6F8] flex items-center gap-2 mb-3">
              <ArrowRightLeft className="w-4 h-4 text-[#19C6B4]" />
              Side-by-Side Scenario Comparison
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {comparedItems.map((c) => (
                <div key={c.id} className="bg-[#171A21] border border-neutral-800 rounded p-4">
                  <p className="font-semibold text-white">{c.name}</p>
                  <p className="text-neutral-400 font-mono mt-0.5">{c.scenarioType}</p>
                  <div className="mt-3 space-y-1 font-mono tabular-nums text-neutral-300">
                    <p>Estimated Mitigated Delay: <span className="text-[#19C6B4]">{c.estimatedDelayHrs} hrs</span></p>
                    <p>Post-Sim Capacity: <span>{c.afterMetrics.hourlyProductionCapacity} u/hr</span></p>
                    <p>Qualified Allocations: <span>{c.recommendations.length}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Multi-Scenario Strategy Comparison Matrix (Scenario A vs B vs C) */}
        {multiCompareData && (
          <div className="bg-[#242A33] border-2 border-[#19C6B4]/60 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#19C6B4] text-[#171A21]">
                    MULTI-SCENARIO SYNTHESIS
                  </span>
                  <h3 className="text-sm font-semibold text-white">
                    Simultaneous Strategic Comparison Matrix ({multiCompareData.comparisonCode})
                  </h3>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Disruption on {multiCompareData.disruptionContext.machineCode} · Order: {multiCompareData.disruptionContext.orderCode}
                </p>
              </div>
              <span className="text-xs text-neutral-400 font-mono">3 Strategic Branches Evaluated</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {multiCompareData.scenarios.map((sc: any) => (
                <div
                  key={sc.scenarioId}
                  className="bg-[#171A21] border border-neutral-800 rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-neutral-600 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                      <span className="font-bold text-white text-xs">{sc.title}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        sc.metrics.riskLevel === 'LOW' ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-amber-400/20 text-amber-300'
                      }`}>
                        {sc.metrics.riskLevel} Risk
                      </span>
                    </div>

                    <p className="text-neutral-300 mt-2 text-xs leading-relaxed">{sc.description}</p>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-neutral-800/80 font-mono text-[11px] tabular-nums">
                      <div className="bg-[#1f242d] p-2 rounded">
                        <span className="text-neutral-400 block text-[10px]">SCHEDULE DELAY</span>
                        <span className="text-white font-bold">{sc.metrics.scheduleDelayHrs} hrs</span>
                      </div>
                      <div className="bg-[#1f242d] p-2 rounded">
                        <span className="text-neutral-400 block text-[10px]">UTILIZATION</span>
                        <span className="text-[#19C6B4] font-bold">{sc.metrics.capacityUtilizationPct}%</span>
                      </div>
                      <div className="bg-[#1f242d] p-2 rounded">
                        <span className="text-neutral-400 block text-[10px]">RECOVERY COST</span>
                        <span className="text-neutral-200 font-bold">${sc.metrics.recoveryCostUsd}</span>
                      </div>
                      <div className="bg-[#1f242d] p-2 rounded">
                        <span className="text-neutral-400 block text-[10px]">FEASIBILITY</span>
                        <span className="text-[#22C55E] font-bold">{sc.metrics.feasibilityScore}/100</span>
                      </div>
                    </div>

                    {/* Operational Assumptions */}
                    <div className="mt-3">
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono block mb-1">
                        Assumptions:
                      </span>
                      <ul className="space-y-1 text-[11px] text-neutral-400 list-disc list-inside">
                        {sc.assumptions.map((asm: string, idx: number) => (
                          <li key={idx}>{asm}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={() => handleConvertSelectedScenario(sc.scenarioId)}
                    className="w-full mt-3 py-2 px-3 bg-[#FF8A32] hover:bg-[#ff9b4f] text-[#171A21] font-bold text-xs rounded transition-colors flex items-center justify-center gap-1.5"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Convert to Live Recovery Proposal</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved Simulation History */}
        <div className="bg-[#242A33] border border-neutral-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#F5F6F8]">Saved Simulation History (Select 2 to Compare)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1B1F27] text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-4">Compare</th>
                  <th className="py-2.5 px-4">Scenario Name</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4 text-right">Est. Delay</th>
                  <th className="py-2.5 px-4 text-right">Options</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {simulations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-neutral-400">
                      Run a scenario above to save and compare snapshots.
                    </td>
                  </tr>
                ) : (
                  simulations.map((s) => (
                    <tr key={s.id} className="hover:bg-[#2B323D]/40">
                      <td className="py-2.5 px-4">
                        <input
                          type="checkbox"
                          checked={compareIds.includes(s.id)}
                          onChange={() => toggleCompare(s.id)}
                          className="rounded border-neutral-600 bg-[#171A21]"
                        />
                      </td>
                      <td className="py-2.5 px-4 font-medium text-white">{s.name}</td>
                      <td className="py-2.5 px-4 font-mono text-neutral-300">{s.scenarioType}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#19C6B4]">
                        {s.estimatedDelayHrs} hrs
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{s.recommendations.length}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => handleConvertToRecoveryPlan(s.id)}
                          className="text-xs font-semibold text-[#FF8A32] hover:underline"
                        >
                          Convert to Recovery Plan
                        </button>
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
