import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle,
  AlertCircle,
  FileText,
  RefreshCw,
  Layers,
  Users,
  Cpu,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { DashboardShell, NavItem } from '../components/DashboardShell';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { LayoutDashboard, Building2, Award, Sliders, FileSearch } from 'lucide-react';

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

const SAMPLE_TEMPLATES: Record<string, string> = {
  workers: `employee_code,full_name,email,phone,designation
EMP-9001,Johnathan Vance,j.vance@factorypulse.demo,+1-555-0191,Senior CNC Specialist
EMP-9002,Maria Vasquez,m.vasquez@factorypulse.demo,+1-555-0192,Press Tooling Operator
EMP-9003,Liam Chen,l.chen@factorypulse.demo,+1-555-0193,Robotics Technician`,

  machines: `machine_code,name,model_number,capacity_units_per_hr,department_code
CNC-03,5-Axis Precision Milling Center,HAAS-VF4,45,MACH
PRESS-02,Hydraulic Stamping Press 500T,SCHULER-500,75,STAMP
ROBOT-03,Automated Dual Robotic Arm,ABB-IRB6700,60,ASSY`,

  production_orders: `order_code,product_name,target_qty,deadline
ORD-2026-901,High-Precision Aerospace Rotor Hub,250,2026-11-20T18:00:00Z
ORD-2026-902,Reinforced Chassis Bracket Assembly,600,2026-11-25T18:00:00Z
ORD-2026-903,Thermal Sensor Enclosure Casing,450,2026-11-30T18:00:00Z`,
};

export const DataManagementPage: React.FC = () => {
  const { notify } = useToast();

  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [selectedEntity, setSelectedEntity] = useState<'workers' | 'machines' | 'production_orders'>('workers');
  const [csvInput, setCsvInput] = useState(SAMPLE_TEMPLATES.workers);

  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importSuccessResult, setImportSuccessResult] = useState<any>(null);

  const handleEntityChange = (entity: 'workers' | 'machines' | 'production_orders') => {
    setSelectedEntity(entity);
    setCsvInput(SAMPLE_TEMPLATES[entity]);
    setValidationResult(null);
    setImportSuccessResult(null);
  };

  const handleValidate = async () => {
    if (!csvInput.trim()) {
      notify('Please provide CSV data to validate.', 'warning');
      return;
    }

    setValidating(true);
    setValidationResult(null);
    setImportSuccessResult(null);

    try {
      const res = await apiFetch<any>('/api/admin/data-management/validate-csv', {
        method: 'POST',
        body: JSON.stringify({
          entity: selectedEntity,
          csvText: csvInput,
        }),
      });
      setValidationResult(res);
      notify(`Validation completed: ${res.validRows} valid rows, ${res.errorCount} errors.`, res.errorCount > 0 ? 'warning' : 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!validationResult || validationResult.validRows === 0) {
      notify('Please validate the CSV successfully before importing.', 'warning');
      return;
    }

    setImporting(true);
    try {
      const res = await apiFetch<any>('/api/admin/data-management/import-csv', {
        method: 'POST',
        body: JSON.stringify({
          entity: selectedEntity,
          csvText: csvInput,
        }),
      });

      setImportSuccessResult(res);
      notify(res.message, 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadCsv = (entity: string) => {
    const token = localStorage.getItem('factorypulse_auth_token');
    fetch(`/api/admin/data-management/export-csv?entity=${entity}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Export request failed.');
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `factorypulse-${entity}-export.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        notify(`Exported ${entity} CSV file successfully.`, 'success');
      })
      .catch((err) => notify(err.message, 'error'));
  };

  return (
    <DashboardShell
      roleTitle="Administrator"
      accentHex="#22C55E"
      navItems={ADMIN_NAV}
      activeTab="data-management"
      onSelectTab={() => {}}
      pageTitle="Authorized Data Management"
      breadcrumbSub="Enterprise Bulk Import & Export Gateway"
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-neutral-800 pb-3">
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-colors ${
              activeTab === 'import' ? 'bg-[#22C55E] text-[#171A21]' : 'bg-[#242A33] text-neutral-300 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>CSV Bulk Data Import</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-colors ${
              activeTab === 'export' ? 'bg-[#22C55E] text-[#171A21]' : 'bg-[#242A33] text-neutral-300 hover:text-white'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>CSV Master Data Export</span>
          </button>
        </div>

        {activeTab === 'import' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input & Form Area */}
            <div className="lg:col-span-2 bg-[#242A33] border border-neutral-800 rounded-lg p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-wide uppercase">Select Target Domain Entity</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Choose dataset schema for schema check and deduplication.</p>
                </div>

                <div className="flex items-center gap-1.5 bg-[#171A21] p-1 rounded border border-neutral-700">
                  <button
                    onClick={() => handleEntityChange('workers')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      selectedEntity === 'workers' ? 'bg-neutral-800 text-[#22C55E]' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Workers
                  </button>
                  <button
                    onClick={() => handleEntityChange('machines')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      selectedEntity === 'machines' ? 'bg-neutral-800 text-[#22C55E]' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Machines
                  </button>
                  <button
                    onClick={() => handleEntityChange('production_orders')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      selectedEntity === 'production_orders' ? 'bg-neutral-800 text-[#22C55E]' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Orders
                  </button>
                </div>
              </div>

              {/* Textarea for CSV */}
              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="font-medium text-neutral-300">RFC-4180 CSV Payload</span>
                  <button
                    onClick={() => setCsvInput(SAMPLE_TEMPLATES[selectedEntity])}
                    className="text-neutral-400 hover:text-white underline text-[11px]"
                  >
                    Restore Standard Sample Payload
                  </button>
                </div>
                <textarea
                  rows={9}
                  value={csvInput}
                  onChange={(e) => {
                    setCsvInput(e.target.value);
                    setValidationResult(null);
                  }}
                  className="w-full font-mono text-xs bg-[#171A21] border border-neutral-700 rounded-md p-3 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-[#22C55E] leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                <span className="text-xs text-neutral-400 font-mono">
                  Atomic SQLite transactions prevent partial corruption.
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} />
                    <span>Validate CSV</span>
                  </button>

                  <button
                    onClick={handleImport}
                    disabled={importing || !validationResult || validationResult.validRows === 0}
                    className="px-4 py-2 bg-[#22C55E] hover:bg-[#16a34a] text-[#171A21] rounded text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Execute Transaction Import</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Validation & Preview Output */}
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-5 flex flex-col h-full">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 pb-3 border-b border-neutral-800">
                Validation & Integrity Engine
              </h3>

              {!validationResult && !importSuccessResult ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-xs text-neutral-500 font-mono">
                  <FileSpreadsheet className="w-10 h-10 text-neutral-600 mb-2" />
                  Click "Validate CSV" to run pre-flight column checks and duplicate detection before committing.
                </div>
              ) : importSuccessResult ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <CheckCircle className="w-12 h-12 text-[#22C55E]" />
                  <h4 className="text-sm font-bold text-white">Import Committed Successfully</h4>
                  <p className="text-xs text-neutral-300 leading-relaxed font-mono">
                    {importSuccessResult.message} ({importSuccessResult.importedCount} new, {importSuccessResult.updatedCount} updated)
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-4 flex-1 overflow-y-auto pr-1">
                  {/* Summary Metric Ribbon */}
                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    <div className="bg-[#171A21] p-2 rounded border border-neutral-800">
                      <span className="text-[10px] text-neutral-400 block">TOTAL ROWS</span>
                      <span className="text-sm font-bold text-white tabular-nums">{validationResult.totalRows}</span>
                    </div>
                    <div className="bg-[#171A21] p-2 rounded border border-neutral-800">
                      <span className="text-[10px] text-[#22C55E] block">VALID ROWS</span>
                      <span className="text-sm font-bold text-[#22C55E] tabular-nums">{validationResult.validRows}</span>
                    </div>
                    <div className="bg-[#171A21] p-2 rounded border border-neutral-800">
                      <span className="text-[10px] text-[#EF4444] block">ERRORS</span>
                      <span className="text-sm font-bold text-[#EF4444] tabular-nums">{validationResult.errorCount}</span>
                    </div>
                  </div>

                  {/* Errors Breakdown */}
                  {validationResult.errors && validationResult.errors.length > 0 && (
                    <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded p-3 text-xs space-y-1">
                      <span className="font-semibold text-[#EF4444] block mb-1">Pre-flight Error Log:</span>
                      {validationResult.errors.map((err: any, idx: number) => (
                        <div key={idx} className="text-neutral-300 font-mono text-[11px]">
                          Line {err.row}: [{err.field}] {err.message}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Row Previews */}
                  <div>
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block mb-2">
                      Row Preview
                    </span>
                    <div className="divide-y divide-neutral-800 text-xs">
                      {validationResult.preview?.map((p: any, idx: number) => (
                        <div key={idx} className="py-2 flex items-center justify-between">
                          <span className="font-mono text-neutral-300 truncate max-w-[180px]">
                            {p.employee_code || p.machine_code || p.order_code}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            p._status === 'VALID_NEW' ? 'bg-[#22C55E]/20 text-[#22C55E]' :
                            p._status === 'EXISTS_UPDATE' ? 'bg-amber-400/20 text-amber-300' :
                            'bg-[#EF4444]/20 text-[#EF4444]'
                          }`}>
                            {p._status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Export Tab */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-[#19C6B4]" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Workforce Register</h3>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Export complete active workers registry including employee code, contact details, designations, shift assignments, and hourly rates.
                </p>
              </div>
              <button
                onClick={() => handleDownloadCsv('workers')}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-neutral-500 rounded text-xs font-semibold transition-colors"
              >
                <Download className="w-4 h-4 text-[#22C55E]" />
                <span>Export Workers CSV</span>
              </button>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Cpu className="w-5 h-5 text-[#22C55E]" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Machine Asset Registry</h3>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Export machine fleet specifications, operational statuses, rated hourly capacities, department links, and utilization percentages.
                </p>
              </div>
              <button
                onClick={() => handleDownloadCsv('machines')}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-neutral-500 rounded text-xs font-semibold transition-colors"
              >
                <Download className="w-4 h-4 text-[#22C55E]" />
                <span>Export Machines CSV</span>
              </button>
            </div>

            <div className="bg-[#242A33] border border-neutral-800 rounded-lg p-6 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-5 h-5 text-[#FF8A32]" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Production Orders</h3>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Export production order queues, product titles, target quantities, produced quantities, SLA deadlines, and priorities.
                </p>
              </div>
              <button
                onClick={() => handleDownloadCsv('production_orders')}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-neutral-500 rounded text-xs font-semibold transition-colors"
              >
                <Download className="w-4 h-4 text-[#22C55E]" />
                <span>Export Orders CSV</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
};
