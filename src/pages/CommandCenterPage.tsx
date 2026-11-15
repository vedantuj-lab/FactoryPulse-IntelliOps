import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Users,
  Cpu,
  Clock,
  ShieldAlert,
  Wrench,
  GitBranch,
  CheckCircle2,
  Filter,
  Search,
  RefreshCw,
  Plus,
  Eye,
  Check,
  ChevronRight,
  TrendingUp,
  Radio,
  FileText,
  Sliders,
} from 'lucide-react';
import { DashboardShell } from '../components/DashboardShell';
import { MANAGER_NAV_ITEMS } from './RecoveryEnginePage';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface CommandMetrics {
  activeWorkers: number;
  totalWorkers: number;
  operatingMachines: number;
  faultMachines: number;
  totalMachines: number;
  delayedOrders: number;
  criticalSafety: number;
  pendingMaint: number;
  activeRecoveryPlans: number;
  openCorrectiveActions: number;
}

interface OperationalEventItem {
  id: string;
  event_code: string;
  event_type: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  entity_type: string;
  entity_id: string | null;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';
  responsible_person_name: string | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export const CommandCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [healthScore, setHealthScore] = useState(85);
  const [healthBreakdown, setHealthBreakdown] = useState<any>({
    machineScore: 35,
    workforceScore: 22,
    safetyScore: 15,
    delayScore: 16,
  });
  const [metrics, setMetrics] = useState<CommandMetrics>({
    activeWorkers: 0,
    totalWorkers: 0,
    operatingMachines: 0,
    faultMachines: 0,
    totalMachines: 0,
    delayedOrders: 0,
    criticalSafety: 0,
    pendingMaint: 0,
    activeRecoveryPlans: 0,
    openCorrectiveActions: 0,
  });
  const [machinesSummary, setMachinesSummary] = useState<any[]>([]);
  const [recentPlans, setRecentPlans] = useState<any[]>([]);

  // Events Timeline
  const [events, setEvents] = useState<OperationalEventItem[]>([]);
  const [eventFilterType, setEventFilterType] = useState('ALL');
  const [eventFilterPriority, setEventFilterPriority] = useState('ALL');
  const [eventFilterStatus, setEventFilterStatus] = useState('ALL');
  const [eventSearch, setEventSearch] = useState('');

  // Manual Log Event Modal
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    eventType: 'OPERATIONAL_ANOMALY',
    priority: 'HIGH',
    description: '',
    entityType: 'SHOP_FLOOR',
  });
  const [submittingEvent, setSubmittingEvent] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const data = await apiFetch<any>('/api/command-center/overview');
      setHealthScore(data.healthScore);
      setHealthBreakdown(data.healthBreakdown);
      setMetrics(data.metrics);
      setMachinesSummary(data.machinesSummary || []);
      setRecentPlans(data.recentRecoveryPlans || []);
    } catch (err: any) {
      notify('Failed to load command center overview: ' + err.message, 'error');
    }
  }, [notify]);

  const loadEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (eventFilterType !== 'ALL') params.set('eventType', eventFilterType);
      if (eventFilterPriority !== 'ALL') params.set('priority', eventFilterPriority);
      if (eventFilterStatus !== 'ALL') params.set('status', eventFilterStatus);
      if (eventSearch.trim()) params.set('search', eventSearch.trim());

      const data = await apiFetch<{ events: OperationalEventItem[] }>(`/api/command-center/events?${params.toString()}`);
      setEvents(data.events || []);
    } catch (err: any) {
      notify('Failed to load event timeline: ' + err.message, 'error');
    }
  }, [eventFilterType, eventFilterPriority, eventFilterStatus, eventSearch, notify]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadOverview(), loadEvents()]);
    setRefreshing(false);
    setLoading(false);
  }, [loadOverview, loadEvents]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 15000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const handleAcknowledge = async (id: string) => {
    try {
      await apiFetch(`/api/command-center/events/${id}/acknowledge`, { method: 'POST' });
      notify('Operational event acknowledged.', 'success');
      loadEvents();
      loadOverview();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.description.trim()) {
      notify('Please enter an event description.', 'warning');
      return;
    }
    setSubmittingEvent(true);
    try {
      await apiFetch('/api/command-center/events', {
        method: 'POST',
        body: JSON.stringify(newEvent),
      });
      notify('Operational event logged successfully.', 'success');
      setLogModalOpen(false);
      setNewEvent({ eventType: 'OPERATIONAL_ANOMALY', priority: 'HIGH', description: '', entityType: 'SHOP_FLOOR' });
      loadEvents();
      loadOverview();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setSubmittingEvent(false);
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case 'CRITICAL': return 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/40';
      case 'HIGH': return 'bg-[#FF8A32]/20 text-[#FF8A32] border-[#FF8A32]/40';
      case 'MEDIUM': return 'bg-amber-400/20 text-amber-300 border-amber-400/30';
      default: return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  const healthColor = (s: number) => {
    if (s >= 80) return 'text-[#22C55E]';
    if (s >= 60) return 'text-[#FF8A32]';
    return 'text-[#EF4444]';
  };

  return (
    <DashboardShell
      roleTitle="Factory Manager"
      accentHex="#FF8A32"
      navItems={MANAGER_NAV_ITEMS}
      activeTab="command-center"
      onSelectTab={() => {}}
      pageTitle="Operational Command Center"
      breadcrumbSub="Real-Time Industrial Synthesis"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLogModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF8A32] text-[#171A21] rounded font-semibold text-xs hover:bg-[#ff9b4f] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Event</span>
          </button>
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#242A33] border border-neutral-700 rounded text-xs text-neutral-200 hover:text-white hover:border-neutral-500 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Top Operational Overview Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Health Gauge Card */}
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider uppercase text-neutral-400">Factory Operational Health</span>
              <Activity className="w-4 h-4 text-[#FF8A32]" />
            </div>
            <div className="my-4 flex items-baseline gap-3">
              <span className={`text-4xl font-mono font-bold tabular-nums ${healthColor(healthScore)}`}>
                {healthScore}
              </span>
              <span className="text-xs text-neutral-400 font-mono">/ 100 Index</span>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-neutral-800/80 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Machine Uptime (40%)</span>
                <span className="font-mono text-neutral-200">{healthBreakdown.machineScore}/40</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Workforce Active (25%)</span>
                <span className="font-mono text-neutral-200">{healthBreakdown.workforceScore}/25</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Safety Compliance (15%)</span>
                <span className="font-mono text-neutral-200">{healthBreakdown.safetyScore}/15</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Schedule Adherence (20%)</span>
                <span className="font-mono text-neutral-200">{healthBreakdown.delayScore}/20</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>Active Operators</span>
                <Users className="w-3.5 h-3.5 text-[#19C6B4]" />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
                {metrics.activeWorkers} <span className="text-xs text-neutral-400 font-normal">/ {metrics.totalWorkers}</span>
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">Shop floor staffing level</div>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>Operating Machines</span>
                <Cpu className="w-3.5 h-3.5 text-[#22C55E]" />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
                {metrics.operatingMachines} <span className="text-xs text-neutral-400 font-normal">/ {metrics.totalMachines}</span>
              </div>
              <div className="mt-2 text-[11px] text-neutral-400 flex items-center gap-1">
                {metrics.faultMachines > 0 ? (
                  <span className="text-[#EF4444] font-semibold">{metrics.faultMachines} in FAULT</span>
                ) : (
                  <span className="text-[#22C55E]">All lines nominal</span>
                )}
              </div>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>Production Delays</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
                {metrics.delayedOrders}
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">Past SLA deadline</div>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>Critical Safety</span>
                <ShieldAlert className="w-3.5 h-3.5 text-[#EF4444]" />
              </div>
              <div className={`mt-2 text-2xl font-mono font-bold tabular-nums ${metrics.criticalSafety > 0 ? 'text-[#EF4444]' : 'text-neutral-200'}`}>
                {metrics.criticalSafety}
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">Open incidents</div>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>Pending Maintenance</span>
                <Wrench className="w-3.5 h-3.5 text-[#8B5CF6]" />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
                {metrics.pendingMaint}
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">Active repair dispatches</div>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>Active Recovery Plans</span>
                <GitBranch className="w-3.5 h-3.5 text-[#FF8A32]" />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
                {metrics.activeRecoveryPlans}
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">In evaluation or execution</div>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>Corrective Actions</span>
                <FileText className="w-3.5 h-3.5 text-neutral-300" />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
                {metrics.openCorrectiveActions}
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">Outstanding safety tasks</div>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>Bottlenecks</span>
                <TrendingUp className="w-3.5 h-3.5 text-[#FF8A32]" />
              </div>
              <button
                onClick={() => navigate('/manager/bottleneck-analysis')}
                className="mt-2 flex items-center justify-between text-xs text-[#FF8A32] hover:text-[#ff9b4f] font-semibold"
              >
                <span>View Engine</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <div className="text-[11px] text-neutral-400">Capacity gap analysis</div>
            </div>
          </div>
        </div>

        {/* Operational Event Timeline Section */}
        <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#FF8A32]" />
              <h2 className="text-sm font-semibold text-white tracking-wide uppercase">Live Operational Event Timeline</h2>
              <span className="text-xs text-neutral-400 font-mono">({events.length} records)</span>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search code, desc..."
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-neutral-200 placeholder-neutral-500 text-xs focus:outline-none focus:border-[#FF8A32]"
                />
              </div>

              <select
                value={eventFilterPriority}
                onChange={(e) => setEventFilterPriority(e.target.value)}
                className="px-2.5 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-neutral-300 text-xs focus:outline-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <select
                value={eventFilterStatus}
                onChange={(e) => setEventFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-neutral-300 text-xs focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
          </div>

          {/* Events List */}
          <div className="divide-y divide-neutral-800/80 mt-2 max-h-[480px] overflow-y-auto">
            {events.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500 font-mono">
                No operational events match current filter criteria.
              </div>
            ) : (
              events.map((evt) => (
                <div key={evt.id} className="py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-[#1f242d] px-2 rounded transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 mt-0.5 ${priorityColor(evt.priority)}`}>
                      {evt.priority}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-neutral-200">{evt.event_code}</span>
                        <span className="text-[11px] text-neutral-400 font-mono">[{evt.event_type}]</span>
                        <span className="text-[11px] text-neutral-500 font-mono">· {new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <p className="text-xs text-neutral-300 mt-0.5 leading-snug">{evt.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-500">
                        {evt.responsible_person_name && (
                          <span>Resp: <strong className="text-neutral-400">{evt.responsible_person_name}</strong></span>
                        )}
                        {evt.acknowledged_by_name && (
                          <span className="text-[#22C55E]">Ack by: {evt.acknowledged_by_name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {evt.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleAcknowledge(evt.id)}
                        className="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 hover:border-neutral-500 transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3 h-3 text-[#22C55E]" />
                        <span>Acknowledge</span>
                      </button>
                    )}
                    <span className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                      evt.status === 'ACTIVE' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                      evt.status === 'ACKNOWLEDGED' ? 'bg-amber-400/10 text-amber-300' :
                      'bg-[#22C55E]/10 text-[#22C55E]'
                    }`}>
                      {evt.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lower Grid: Machines Fleet Matrix & Active Recovery Plans */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Machines Fleet Matrix */}
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#19C6B4]" />
                <h3 className="text-sm font-semibold text-white tracking-wide uppercase">Machine Fleet Status Matrix</h3>
              </div>
              <button
                onClick={() => navigate('/manager/dashboard?tab=machines')}
                className="text-xs text-[#FF8A32] hover:underline"
              >
                Full Registry
              </button>
            </div>
            <div className="divide-y divide-neutral-800/80 mt-2 max-h-[300px] overflow-y-auto">
              {machinesSummary.slice(0, 8).map((m) => (
                <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-white">{m.machine_code}</span>
                      <span className="text-neutral-400 truncate">{m.name}</span>
                    </div>
                    <span className="text-[11px] text-neutral-500">{m.department_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-neutral-300 tabular-nums">{m.utilization_pct}% Util</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                      m.status === 'OPERATING' ? 'bg-[#22C55E]/20 text-[#22C55E]' :
                      m.status === 'FAULT' ? 'bg-[#EF4444]/20 text-[#EF4444]' :
                      'bg-amber-400/20 text-amber-300'
                    }`}>
                      {m.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Recovery Plans Card */}
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[#FF8A32]" />
                <h3 className="text-sm font-semibold text-white tracking-wide uppercase">Intelligent Recovery Actions</h3>
              </div>
              <button
                onClick={() => navigate('/manager/recovery-engine')}
                className="text-xs text-[#FF8A32] hover:underline"
              >
                Recovery Engine
              </button>
            </div>
            <div className="divide-y divide-neutral-800/80 mt-2">
              {recentPlans.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-500 font-mono">
                  No active disruption recovery plans pending.
                </div>
              ) : (
                recentPlans.map((plan) => (
                  <div key={plan.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-neutral-200">{plan.plan_code}</span>
                        <span className="text-[11px] text-neutral-400 font-mono">[{plan.event_type}]</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">{plan.summary}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        plan.status === 'PROPOSED' ? 'bg-[#FF8A32]/20 text-[#FF8A32]' :
                        plan.status === 'APPROVED' ? 'bg-[#22C55E]/20 text-[#22C55E]' :
                        'bg-neutral-800 text-neutral-400'
                      }`}>
                        {plan.status}
                      </span>
                      <button
                        onClick={() => navigate('/manager/recovery-engine')}
                        className="p-1 hover:bg-[#171A21] rounded text-neutral-400 hover:text-white"
                        title="View Plan"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Log Operational Event Modal */}
      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#242A33] border border-neutral-700 rounded-lg max-w-lg w-full p-6 text-[#F5F6F8]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Log Operational Event</h3>
            <p className="text-xs text-neutral-400 mt-1">
              Broadcast an immediate shop-floor operational incident or status change across all manager command channels.
            </p>

            <form onSubmit={handleCreateEvent} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Event Type</label>
                <select
                  value={newEvent.eventType}
                  onChange={(e) => setNewEvent({ ...newEvent, eventType: e.target.value })}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded text-xs text-neutral-200 focus:outline-none focus:border-[#FF8A32]"
                >
                  <option value="OPERATIONAL_ANOMALY">Operational Anomaly</option>
                  <option value="LINE_INTERRUPTION">Line Interruption</option>
                  <option value="TOOLING_DEGRADATION">Tooling Degradation</option>
                  <option value="MATERIAL_SHORTAGE">Material Shortage</option>
                  <option value="SHIFT_TRANSITION">Shift Transition Note</option>
                  <option value="SAFETY_WARNING">Safety Warning</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Priority Level</label>
                <select
                  value={newEvent.priority}
                  onChange={(e) => setNewEvent({ ...newEvent, priority: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded text-xs text-neutral-200 focus:outline-none focus:border-[#FF8A32]"
                >
                  <option value="LOW">Low - Informational</option>
                  <option value="MEDIUM">Medium - Attention Required</option>
                  <option value="HIGH">High - Urgent Action</option>
                  <option value="CRITICAL">Critical - Halt Risk</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Description & Supporting Facts</label>
                <textarea
                  rows={3}
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Detail machine code, order number, line bay, or operator observation..."
                  className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-[#FF8A32]"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLogModalOpen(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEvent}
                  className="px-4 py-2 bg-[#FF8A32] hover:bg-[#ff9b4f] text-[#171A21] font-semibold text-xs rounded"
                >
                  {submittingEvent ? 'Broadcasting...' : 'Broadcast Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
