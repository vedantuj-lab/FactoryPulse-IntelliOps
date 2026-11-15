import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Filter,
  RefreshCw,
  GitBranch,
  Layers,
  Cpu,
  Users,
  Clock,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { DashboardShell } from '../components/DashboardShell';
import { MANAGER_NAV_ITEMS } from './RecoveryEnginePage';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface BottleneckItem {
  id: string;
  departmentId: string;
  departmentName: string;
  orderId: string | null;
  orderCode: string | null;
  category: 'WORKFORCE_SHORTAGE' | 'MACHINE_CAPACITY_SHORTAGE' | 'MACHINE_DOWNTIME' | 'UNBALANCED_ALLOCATION' | 'SHIFT_STAFFING_SHORTAGE' | 'SCHEDULING_CONFLICT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiredCapacity: number;
  availableCapacity: number;
  capacityGap: number;
  supportingData: Record<string, any>;
  operationalImpact: string;
  recommendedAction: string;
  status: 'CONFIRMED' | 'POTENTIAL' | 'MITIGATED';
  detectedAt: string;
}

export const BottleneckAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bottlenecks, setBottlenecks] = useState<BottleneckItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  const loadBottlenecks = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await apiFetch<{ bottlenecks: BottleneckItem[]; summary: any }>('/api/bottleneck-analysis');
      setBottlenecks(data.bottlenecks || []);
      setSummary(data.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0 });
    } catch (err: any) {
      notify('Failed to load bottleneck analysis: ' + err.message, 'error');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadBottlenecks();
  }, [loadBottlenecks]);

  const handleMitigate = async (id: string) => {
    try {
      await apiFetch(`/api/bottleneck-analysis/${id}/mitigate`, { method: 'POST' });
      notify('Bottleneck flagged as mitigated.', 'success');
      loadBottlenecks();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const filtered = bottlenecks.filter((b) => {
    if (categoryFilter !== 'ALL' && b.category !== categoryFilter) return false;
    if (severityFilter !== 'ALL' && b.severity !== severityFilter) return false;
    return true;
  });

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'WORKFORCE_SHORTAGE': return <Users className="w-4 h-4 text-[#19C6B4]" />;
      case 'MACHINE_CAPACITY_SHORTAGE': return <Cpu className="w-4 h-4 text-amber-400" />;
      case 'MACHINE_DOWNTIME': return <AlertTriangle className="w-4 h-4 text-[#EF4444]" />;
      case 'UNBALANCED_ALLOCATION': return <SlidersHorizontal className="w-4 h-4 text-[#8B5CF6]" />;
      case 'SHIFT_STAFFING_SHORTAGE': return <Clock className="w-4 h-4 text-orange-400" />;
      case 'SCHEDULING_CONFLICT': return <Layers className="w-4 h-4 text-rose-400" />;
      default: return <TrendingUp className="w-4 h-4 text-neutral-400" />;
    }
  };

  const getCategoryTitle = (cat: string) => {
    switch (cat) {
      case 'WORKFORCE_SHORTAGE': return 'Workforce Shortage';
      case 'MACHINE_CAPACITY_SHORTAGE': return 'Machine Capacity Shortage';
      case 'MACHINE_DOWNTIME': return 'Machine Downtime Outage';
      case 'UNBALANCED_ALLOCATION': return 'Unbalanced Production Allocation';
      case 'SHIFT_STAFFING_SHORTAGE': return 'Shift Staffing Shortage';
      case 'SCHEDULING_CONFLICT': return 'Production Scheduling Conflict';
      default: return cat;
    }
  };

  const severityBadge = (s: string) => {
    switch (s) {
      case 'CRITICAL': return 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/50';
      case 'HIGH': return 'bg-[#FF8A32]/20 text-[#FF8A32] border-[#FF8A32]/50';
      case 'MEDIUM': return 'bg-amber-400/20 text-amber-300 border-amber-400/40';
      default: return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  return (
    <DashboardShell
      roleTitle="Factory Manager"
      accentHex="#FF8A32"
      navItems={MANAGER_NAV_ITEMS}
      activeTab="bottleneck"
      onSelectTab={() => {}}
      pageTitle="Rule-Based Bottleneck Detection"
      breadcrumbSub="Shop Floor Constraint Engineering"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/manager/recovery-engine')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF8A32] text-[#171A21] rounded font-semibold text-xs hover:bg-[#ff9b4f] transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Launch Recovery Engine</span>
          </button>
          <button
            onClick={loadBottlenecks}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#242A33] border border-neutral-700 rounded text-xs text-neutral-200 hover:text-white hover:border-neutral-500 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Re-evaluate</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Summary Metric Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-3">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider">Identified Constraints</span>
            <div className="text-2xl font-mono font-bold text-white mt-1 tabular-nums">{summary.total}</div>
          </div>
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-3">
            <span className="text-[11px] text-[#EF4444] uppercase tracking-wider font-semibold">Critical Severity</span>
            <div className="text-2xl font-mono font-bold text-[#EF4444] mt-1 tabular-nums">{summary.critical}</div>
          </div>
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-3">
            <span className="text-[11px] text-[#FF8A32] uppercase tracking-wider font-semibold">High Severity</span>
            <div className="text-2xl font-mono font-bold text-[#FF8A32] mt-1 tabular-nums">{summary.high}</div>
          </div>
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-3">
            <span className="text-[11px] text-amber-400 uppercase tracking-wider font-semibold">Medium Severity</span>
            <div className="text-2xl font-mono font-bold text-amber-400 mt-1 tabular-nums">{summary.medium}</div>
          </div>
          <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-3">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider">Low Severity</span>
            <div className="text-2xl font-mono font-bold text-neutral-300 mt-1 tabular-nums">{summary.low}</div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#242A33] border border-neutral-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-300 font-medium">Filter Engine Output:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-neutral-300 text-xs focus:outline-none"
            >
              <option value="ALL">All 6 Bottleneck Categories</option>
              <option value="WORKFORCE_SHORTAGE">Workforce Shortage</option>
              <option value="MACHINE_CAPACITY_SHORTAGE">Machine Capacity Shortage</option>
              <option value="MACHINE_DOWNTIME">Machine Downtime</option>
              <option value="UNBALANCED_ALLOCATION">Unbalanced Allocation</option>
              <option value="SHIFT_STAFFING_SHORTAGE">Shift Staffing Shortage</option>
              <option value="SCHEDULING_CONFLICT">Scheduling Conflict</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#171A21] border border-neutral-700 rounded text-neutral-300 text-xs focus:outline-none"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>

        {/* Bottlenecks List */}
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-12 text-center text-xs text-neutral-400 font-mono">
              <CheckCircle className="w-8 h-8 text-[#22C55E] mx-auto mb-2 opacity-80" />
              No active operational bottlenecks identified under current parameters. All lines operating within takt tolerances.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="bg-[#242A33] border border-neutral-800 rounded-lg p-5 space-y-4 hover:border-neutral-700 transition-colors"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800">
                  <div className="flex items-center gap-2.5">
                    {getCategoryIcon(item.category)}
                    <div>
                      <h3 className="text-sm font-semibold text-white tracking-wide">
                        {getCategoryTitle(item.category)}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                        <span className="font-medium text-neutral-300">{item.departmentName}</span>
                        {item.orderCode && (
                          <span className="font-mono text-[#FF8A32]">· Order: {item.orderCode}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-semibold border ${severityBadge(item.severity)}`}>
                      {item.severity}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                      item.status === 'MITIGATED' ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-neutral-800 text-neutral-400'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>

                {/* Capacity Gap Calculation Box */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#171A21] border border-neutral-800 rounded-md p-3.5">
                  <div>
                    <span className="text-[11px] text-neutral-400 block font-mono">REQUIRED CAPACITY</span>
                    <span className="text-lg font-mono font-bold text-white tabular-nums">
                      {item.requiredCapacity}
                    </span>
                    <span className="text-[10px] text-neutral-500 ml-1">target load</span>
                  </div>

                  <div>
                    <span className="text-[11px] text-neutral-400 block font-mono">AVAILABLE CAPACITY</span>
                    <span className="text-lg font-mono font-bold text-[#19C6B4] tabular-nums">
                      {item.availableCapacity}
                    </span>
                    <span className="text-[10px] text-neutral-500 ml-1">actual throughput</span>
                  </div>

                  <div>
                    <span className="text-[11px] text-neutral-400 block font-mono">CAPACITY DEFICIT / GAP</span>
                    <span className="text-lg font-mono font-bold text-[#EF4444] tabular-nums">
                      -{Math.abs(item.capacityGap)}
                    </span>
                    <span className="text-[10px] text-[#EF4444]/80 ml-1">variance</span>
                  </div>
                </div>

                {/* Supporting Facts & Operational Impact */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block mb-1">
                      Supporting Data & Root Facts
                    </span>
                    <div className="bg-[#1b2028] border border-neutral-800 rounded p-2.5 font-mono text-[11px] text-neutral-300 space-y-1">
                      {Object.entries(item.supportingData || {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-neutral-500">{k}:</span>
                          <span className="text-neutral-200">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block mb-1">
                        Operational Impact
                      </span>
                      <p className="text-xs text-neutral-300 leading-relaxed bg-[#1b2028] border border-neutral-800 rounded p-2.5">
                        {item.operationalImpact}
                      </p>
                    </div>

                    <div className="mt-3">
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-[#FF8A32] block mb-1">
                        Recommended Action
                      </span>
                      <p className="text-xs text-white font-medium bg-[#FF8A32]/10 border border-[#FF8A32]/30 rounded p-2.5">
                        {item.recommendedAction}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Footer */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-neutral-800/80">
                  {item.status !== 'MITIGATED' && (
                    <button
                      onClick={() => handleMitigate(item.id)}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded border border-neutral-700 transition-colors"
                    >
                      Mark Mitigated
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/manager/recovery-engine')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF8A32] text-[#171A21] font-semibold text-xs rounded hover:bg-[#ff9b4f] transition-colors"
                  >
                    <span>Execute Recovery Rebalance</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardShell>
  );
};
