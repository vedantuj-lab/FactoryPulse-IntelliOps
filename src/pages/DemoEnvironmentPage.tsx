import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  PlayCircle,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Wrench,
  GitBranch,
  ArrowRight,
  Activity,
  Layers,
  Radio,
  Clock,
  Sparkles,
} from 'lucide-react';
import { DashboardShell, NavItem } from '../components/DashboardShell';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { LayoutDashboard, Building2, Users, Award, Sliders, FileSearch, FileSpreadsheet } from 'lucide-react';

const ADMIN_NAV: NavItem[] = [
  { id: 'overview', label: 'System Overview', icon: LayoutDashboard, group: 'Governance', href: '/admin/dashboard' },
  { id: 'data-management', label: 'Data Management (CSV)', icon: FileSpreadsheet, group: 'Governance', href: '/admin/data-management' },
  { id: 'demo-env', label: 'Demonstration Suite', icon: ShieldAlert, group: 'Governance', href: '/admin/demo-environment' },
  { id: 'factories', label: 'Factory Management', icon: Building2, group: 'Governance', href: '/admin/dashboard' },
  { id: 'users', label: 'User Administration', icon: Users, group: 'Identity & Skills', href: '/admin/dashboard' },
  { id: 'skills', label: 'Skills & Certifications', icon: Award, group: 'Identity & Skills', href: '/admin/dashboard' },
  { id: 'machines', label: 'Machine Registry', icon: Cpu, group: 'Assets & Config', href: '/admin/dashboard' },
  { id: 'config', label: 'System Configuration', icon: Sliders, group: 'Assets & Config', href: '/admin/dashboard' },
  { id: 'audits', label: 'Audit Logs', icon: FileSearch, group: 'Compliance', href: '/admin/dashboard' },
];

export const DemoEnvironmentPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [loading, setLoading] = useState(true);
  const [runningDemo, setRunningDemo] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);

  const [demoStatus, setDemoStatus] = useState<any>(null);
  const [lastExecutionResult, setLastExecutionResult] = useState<any>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch<any>('/api/admin/demo-environment/status');
      setDemoStatus(data);
    } catch (err: any) {
      notify('Failed to load demo status: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleRunFailure = async () => {
    setRunningDemo(true);
    setLastExecutionResult(null);
    try {
      const res = await apiFetch<any>('/api/admin/demo-environment/run-failure', { method: 'POST' });
      setLastExecutionResult(res);
      notify('Catastrophic shop-floor disruption simulated. Recovery Engine engaged!', 'warning');
      loadStatus();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setRunningDemo(false);
    }
  };

  const handleReset = async () => {
    setResettingDemo(true);
    setLastExecutionResult(null);
    try {
      const res = await apiFetch<any>('/api/admin/demo-environment/reset', { method: 'POST' });
      notify(res.message, 'success');
      loadStatus();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setResettingDemo(false);
    }
  };

  const isFailureActive = demoStatus?.isDemonstrationActive;

  return (
    <DashboardShell
      roleTitle="Administrator"
      accentHex="#22C55E"
      navItems={ADMIN_NAV}
      activeTab="demo-env"
      onSelectTab={() => {}}
      pageTitle="Dedicated Demonstration Environment"
      breadcrumbSub="High-Fidelity Shop Floor Disruption Simulation"
    >
      <div className="space-y-6">
        {/* Banner: Demonstration Mode Indicator */}
        <div className="bg-[#242A33] border-2 border-[#FF8A32]/60 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#FF8A32]/20 border border-[#FF8A32]/40 rounded">
              <Sparkles className="w-5 h-5 text-[#FF8A32]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#FF8A32] text-[#171A21]">
                  DEMONSTRATION MODE ACTIVE
                </span>
                <span className="text-xs text-neutral-400 font-mono">100% Software-Defined</span>
              </div>
              <p className="text-xs text-neutral-300 mt-1 max-w-2xl leading-relaxed">
                This testing suite allows auditors and stakeholders to inject controlled machine failure events into the shared SQLite database, automatically triggering the multi-role operational workflow (Technician dispatch, Command Center alerts, and Recovery Engine re-allocation).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`w-3 h-3 rounded-full ${isFailureActive ? 'bg-[#EF4444] animate-ping' : 'bg-[#22C55E]'}`} />
            <span className="text-xs font-mono font-semibold text-neutral-200">
              {isFailureActive ? 'SIMULATION DISRUPTION ACTIVE' : 'SYSTEM HEALTH NOMINAL'}
            </span>
          </div>
        </div>

        {/* Dual Master Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Action 1: Trigger Failure */}
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 flex flex-col justify-between space-y-4 hover:border-[#EF4444]/40 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Run Factory Failure Demonstration
                </h3>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Executes an end-to-end simulated bearing thermal seizure on lead machine <strong className="text-white font-mono">CNC-01</strong> in Machining Bay.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-neutral-400 font-mono">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#EF4444] rounded-full" />
                  Sets machine status to <strong className="text-[#EF4444]">FAULT</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#EF4444] rounded-full" />
                  Logs Critical ticket in Maintenance Queue
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#EF4444] rounded-full" />
                  Emits real-time event to Command Center
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#EF4444] rounded-full" />
                  Synthesizes live explainable Recovery Plan
                </li>
              </ul>
            </div>

            <button
              onClick={handleRunFailure}
              disabled={runningDemo || isFailureActive}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#EF4444] hover:bg-[#dc2626] text-white font-bold text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              <PlayCircle className="w-4 h-4" />
              <span>{runningDemo ? 'Simulating Fault...' : 'RUN FACTORY FAILURE DEMONSTRATION'}</span>
            </button>
          </div>

          {/* Action 2: Reset Demo State */}
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 flex flex-col justify-between space-y-4 hover:border-[#22C55E]/40 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <RotateCcw className="w-5 h-5 text-[#22C55E]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Reset Demonstration Environment
                </h3>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Clears all demo failure tickets, sets <strong className="text-white font-mono">CNC-01</strong> back to <strong className="text-[#22C55E]">OPERATING</strong>, resolves test alerts, and returns the factory to its nominal operational baseline.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-neutral-400 font-mono">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#22C55E] rounded-full" />
                  Re-calibrates machine fleet health
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#22C55E] rounded-full" />
                  Closes simulated maintenance orders
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#22C55E] rounded-full" />
                  Marks test recovery proposals stale/resolved
                </li>
              </ul>
            </div>

            <button
              onClick={handleReset}
              disabled={resettingDemo}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-neutral-500 font-bold text-xs rounded transition-colors disabled:opacity-50 shadow-md"
            >
              <RotateCcw className="w-4 h-4 text-[#22C55E]" />
              <span>{resettingDemo ? 'Resetting Fleet...' : 'RESET DEMONSTRATION ENVIRONMENT'}</span>
            </button>
          </div>
        </div>

        {/* Live Simulation Execution Report */}
        {lastExecutionResult && (
          <div className="bg-[#171A21] border border-neutral-700 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                  Simulation Pipeline Execution Output
                </h4>
              </div>
              <span className="text-xs text-neutral-400 font-mono">{lastExecutionResult.machineCode} Fault Active</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#242A33] p-3 rounded border border-neutral-800">
                <span className="text-[11px] text-neutral-400 block font-mono">MAINTENANCE TICKET</span>
                <span className="font-mono font-bold text-[#EF4444] text-sm mt-0.5 block">
                  {lastExecutionResult.ticketCode}
                </span>
                <span className="text-[11px] text-neutral-400 mt-1 block">Critical Spindle Seizure</span>
              </div>

              <div className="bg-[#242A33] p-3 rounded border border-neutral-800">
                <span className="text-[11px] text-neutral-400 block font-mono">RECOVERY PLAN GENERATED</span>
                <span className="font-mono font-bold text-[#FF8A32] text-sm mt-0.5 block">
                  {lastExecutionResult.planCode}
                </span>
                <span className="text-[11px] text-neutral-400 mt-1 block">Explainable Reroute Proposal</span>
              </div>

              <div className="bg-[#242A33] p-3 rounded border border-neutral-800 flex flex-col justify-between">
                <span className="text-[11px] text-neutral-400 block font-mono">INSPECT LIVE ALLOCATION</span>
                <button
                  onClick={() => navigate('/manager/recovery-engine')}
                  className="mt-2 flex items-center justify-between text-xs font-bold text-[#FF8A32] hover:text-[#ff9b4f]"
                >
                  <span>Open in Recovery Engine</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 12-STEP GUIDED DEMONSTRATION STEPPER ("FACTORY RECOVERY LIVE DEMONSTRATION") */}
        <GuidedDemoStepper onTriggerFault={handleRunFailure} onResetDemo={handleReset} />
      </div>
    </DashboardShell>
  );
};

const GuidedDemoStepper: React.FC<{ onTriggerFault: () => void; onResetDemo: () => void }> = ({ onTriggerFault, onResetDemo }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);

  const steps = [
    { step: 1, title: 'Initial Factory Baseline', desc: 'Inspect baseline plant status: 12 machines operating/idle, 30 workforce active, zero critical faults.' },
    { step: 2, title: 'Simulate Machine Failure', desc: 'Inject thermal bearing seizure on CNC-01 in Machining Bay.', action: 'TRIGGER_FAULT' },
    { step: 3, title: 'Identify Affected Resources', desc: 'Locate halted order ORD-2026-901 and displaced operator Vikram Deshmukh.' },
    { step: 4, title: 'Display Operational Impact', desc: 'Calculate unmitigated delay window (3.7 hrs) and shop floor bottleneck.' },
    { step: 5, title: 'Run Recovery Engine', desc: 'Trigger transparent rule-based resource evaluation algorithm.', link: '/manager/recovery-engine' },
    { step: 6, title: 'Hard Constraint Filtering', desc: 'Filter candidates strictly by skills, valid certs, standby availability, and capacity.' },
    { step: 7, title: 'Explain Recommendation Scores', desc: 'Inspect weighted 0–100 score breakdown (Skill 35%, Avail 25%, Machine 20%, Priority 10%, Efficiency 10%).' },
    { step: 8, title: 'Compare Original vs Proposed Plan', desc: 'Compare original halted plan vs proposed dual-stream parallel recovery plan.' },
    { step: 9, title: 'Manager Approval & Governance', desc: 'Re-validate hard constraints inside DB transaction and approve reallocation.' },
    { step: 10, title: 'Update Database Assignments', desc: 'Commit new task rosters and machine assignments to SQLite database inside transaction.' },
    { step: 11, title: 'Refresh Role Dashboards', desc: 'Propagate new task assignments to Worker and Technician terminals immediately.' },
    { step: 12, title: 'Final Restored Baseline', desc: 'Verify restored plant health baseline and reduced delivery delay window (0.4 hrs).', action: 'RESET_DEMO' },
  ];

  const activeStepObj = steps.find((s) => s.step === currentStep) || steps[0];

  return (
    <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800">
        <div>
          <span className="text-xs font-mono font-bold text-[#19C6B4] px-2 py-0.5 bg-[#19C6B4]/15 rounded">
            GUIDED HACKATHON DEMONSTRATION
          </span>
          <h3 className="text-base font-bold text-white mt-1">FACTORY RECOVERY LIVE DEMONSTRATION (12-Step Walkthrough)</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={currentStep <= 1}
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            className="px-3 py-1.5 bg-[#171A21] border border-neutral-700 text-xs text-neutral-300 rounded disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-xs font-mono text-[#FF8A32] px-2">
            Step {currentStep} / 12
          </span>
          <button
            disabled={currentStep >= 12}
            onClick={() => setCurrentStep((s) => Math.min(12, s + 1))}
            className="px-3 py-1.5 bg-[#FF8A32] text-[#171A21] text-xs font-bold rounded hover:bg-[#ff9b4f] disabled:opacity-40"
          >
            Next Step →
          </button>
        </div>
      </div>

      {/* 12 Step Visual Nodes */}
      <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
        {steps.map((s) => (
          <button
            key={s.step}
            onClick={() => setCurrentStep(s.step)}
            className={`py-2 px-1 rounded text-center text-[10px] font-mono border transition-all ${
              s.step === currentStep
                ? 'bg-[#FF8A32] text-[#171A21] border-[#FF8A32] font-bold shadow'
                : s.step < currentStep
                ? 'bg-[#19C6B4]/20 border-[#19C6B4]/40 text-[#19C6B4]'
                : 'bg-[#171A21] border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            S{s.step}
          </button>
        ))}
      </div>

      {/* Active Step Details */}
      <div className="bg-[#171A21] border border-neutral-800 rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-[#FF8A32]">Step {activeStepObj.step} of 12</span>
          <h4 className="text-sm font-bold text-white mt-0.5">{activeStepObj.title}</h4>
          <p className="text-xs text-neutral-300 mt-1 leading-relaxed max-w-2xl">{activeStepObj.desc}</p>
        </div>

        <div className="shrink-0 flex items-center gap-3">
          {activeStepObj.action === 'TRIGGER_FAULT' && (
            <button
              onClick={onTriggerFault}
              className="px-4 py-2 bg-[#EF4444] text-white font-bold text-xs rounded hover:bg-red-600 transition-colors"
            >
              Execute Fault Injection
            </button>
          )}
          {activeStepObj.action === 'RESET_DEMO' && (
            <button
              onClick={onResetDemo}
              className="px-4 py-2 bg-[#22C55E] text-[#171A21] font-bold text-xs rounded hover:bg-emerald-400 transition-colors"
            >
              Reset Baseline State
            </button>
          )}
          {activeStepObj.link && (
            <button
              onClick={() => navigate(activeStepObj.link)}
              className="px-4 py-2 bg-[#FF8A32] text-[#171A21] font-bold text-xs rounded hover:bg-[#ff9b4f] transition-colors"
            >
              Inspect Live Module →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
