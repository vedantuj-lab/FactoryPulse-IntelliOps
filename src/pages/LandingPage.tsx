import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Users,
  Cpu,
  CalendarClock,
  BarChart3,
  ShieldAlert,
  Wrench,
  GitBranch,
  Factory,
  CheckCircle2,
  AlertTriangle,
  Menu,
  X,
  Scale,
  Split,
  Zap,
  TrendingDown,
  Eye,
  Award,
} from 'lucide-react';
import { FactoryPulseLogo, ResilientImage } from '../components/BrandLogo';
import { INDUSTRIAL_ASSETS } from '../lib/assets';
import { apiFetch } from '../lib/api';
import { useAuth, getRoleDashboardPath } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface PublicPulseSummary {
  isDemonstrationDataset: boolean;
  factoryName: string;
  factoryCode: string;
  activeWorkforce: number;
  totalWorkforce: number;
  operatingMachines: number;
  totalMachines: number;
  productionAchievementPct: number;
  pendingMaintenance: number;
}

const PLATFORM_MODULES = [
  {
    id: 'overview',
    title: 'Factory Overview',
    icon: Factory,
    image: INDUSTRIAL_ASSETS.controlCenter,
    desc: 'Consolidated plant-wide operational visibility across departments, shifts, active machines, and open orders.',
    detail: 'Aggregates live database state from assembly, welding, packaging, quality control, and maintenance into role-verified views.',
  },
  {
    id: 'workforce',
    title: 'Workforce Management',
    icon: Users,
    image: INDUSTRIAL_ASSETS.workforceOps,
    desc: 'Skill matrices, valid safety certifications, attendance tracking, and conflict-free task assignments.',
    detail: 'Enforces skill proficiency and certification validity before allowing machine or recovery assignment.',
  },
  {
    id: 'shifts',
    title: 'Shift Planning',
    icon: CalendarClock,
    image: INDUSTRIAL_ASSETS.workforceOps,
    desc: 'Structured Morning, Afternoon, and Night shift rosters with automated overlap and absence prevention.',
    detail: 'Detects staffing gaps per department and blocks duplicate shift bookings on the same date.',
  },
  {
    id: 'machines',
    title: 'Machine Management',
    icon: Cpu,
    image: INDUSTRIAL_ASSETS.cncMachinery,
    desc: 'Complete industrial asset registry tracking operating status, hourly capacity, instructions, and fault history.',
    detail: 'Maintains an immutable audit trail of every status transition between Operating, Idle, Fault, and Maintenance.',
  },
  {
    id: 'production',
    title: 'Production Management',
    icon: BarChart3,
    image: INDUSTRIAL_ASSETS.heroFloor,
    desc: 'Order dispatching, target quantities, priority scheduling, operator progress logs, and downtime capture.',
    detail: 'Synchronizes floor task progress directly from worker terminals to manager analytics in real time.',
  },
  {
    id: 'safety',
    title: 'Safety Management',
    icon: ShieldAlert,
    image: INDUSTRIAL_ASSETS.maintenanceSafety,
    desc: 'Workplace hazard and incident reporting with corrective action assignment, deadlines, and resolution audits.',
    detail: 'Connects frontline hazard reports directly to responsible personnel with tracked closure verification.',
  },
  {
    id: 'maintenance',
    title: 'Maintenance Management',
    icon: Wrench,
    image: INDUSTRIAL_ASSETS.maintenanceSafety,
    desc: 'End-to-end fault intake, technician dispatch, root-cause diagnostics, spare parts logs, and service schedules.',
    detail: 'Automatically restores machine readiness upon verified completion so production planners can reallocate capacity.',
  },
  {
    id: 'recovery',
    title: 'Intelligent Recovery Engine',
    icon: GitBranch,
    image: INDUSTRIAL_ASSETS.controlCenter,
    desc: 'Rule-based operational decision engine calculating eligible backup machines and qualified operators during faults.',
    detail: 'Evaluates hard eligibility constraints first, then ranks options using transparent configurable weights.',
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pulse, setPulse] = useState<PublicPulseSummary>({
    isDemonstrationDataset: true,
    factoryName: 'Northstar Manufacturing Works',
    factoryCode: 'FAC-NMW-01',
    activeWorkforce: 27,
    totalWorkforce: 30,
    operatingMachines: 8,
    totalMachines: 12,
    productionAchievementPct: 72,
    pendingMaintenance: 3,
  });

  // Interactive simulated fault demo state on landing page
  const [simTriggered, setSimTriggered] = useState(false);
  const [simStrategy, setSimStrategy] = useState<'combined' | 'compare' | 'optionA' | 'optionB'>('combined');
  const [selectedModule, setSelectedModule] = useState<typeof PLATFORM_MODULES[0] | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);

  // Contact form
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactOrg, setContactOrg] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  useEffect(() => {
    apiFetch<PublicPulseSummary>('/api/public/pulse-summary')
      .then((res) => setPulse(res))
      .catch(() => {});
  }, []);

  const handlePrimaryEntry = () => {
    if (user) {
      navigate(getRoleDashboardPath(user.role));
    } else {
      navigate('/login');
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail.includes('@') || contactName.trim().length < 2) {
      notify('error', 'Validation error', 'Please enter your full name and a valid work email.');
      return;
    }
    setContactSubmitted(true);
    notify('success', 'Inquiry recorded', 'Our industrial operations engineering team has received your message.');
    setContactName('');
    setContactEmail('');
    setContactOrg('');
    setContactMsg('');
  };

  return (
    <div id="home" className="min-h-screen bg-[#171A21] text-[#F5F6F8]">
      {/* Sticky Top Bar Contract: Zone 1 Wordmark — Zone 2 Concise Nav Links — Zone 3 Primary Action */}
      <header className="sticky top-0 z-40 h-16 bg-[#171A21]/95 backdrop-blur border-b border-neutral-800 px-4 sm:px-8 flex items-center justify-between gap-8">
        <a href="#home" className="text-lg font-bold tracking-tight text-[#F5F6F8] whitespace-nowrap shrink-0">
          FactoryPulse <span className="text-[#FF8A32]">IntelliOps</span>
        </a>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-neutral-300">
          <a href="#platform" className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
            Platform
          </a>
          <a href="#recovery" className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
            Recovery
          </a>
          <a href="#features" className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
            How It Works
          </a>
          <a href="#contact" className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
            Contact
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handlePrimaryEntry}
            className="px-4 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] transition-colors whitespace-nowrap shrink-0"
          >
            {user ? 'Open Dashboard' : 'Get Started'}
          </button>
          <button
            onClick={() => setMobileNavOpen((o) => !o)}
            className="lg:hidden p-2 text-neutral-300 hover:text-white"
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {mobileNavOpen && (
        <div className="lg:hidden bg-[#1D222B] border-b border-neutral-800 px-6 py-4 space-y-3 text-sm">
          <a href="#platform" onClick={() => setMobileNavOpen(false)} className="block text-neutral-200 py-1">Platform</a>
          <a href="#recovery" onClick={() => setMobileNavOpen(false)} className="block text-neutral-200 py-1">Intelligent Recovery</a>
          <a href="#features" onClick={() => setMobileNavOpen(false)} className="block text-neutral-200 py-1">Features</a>
          <a href="#how-it-works" onClick={() => setMobileNavOpen(false)} className="block text-neutral-200 py-1">How It Works</a>
          <a href="#benefits" onClick={() => setMobileNavOpen(false)} className="block text-neutral-200 py-1">Benefits</a>
          <a href="#about" onClick={() => setMobileNavOpen(false)} className="block text-neutral-200 py-1">About</a>
          <a href="#contact" onClick={() => setMobileNavOpen(false)} className="block text-neutral-200 py-1">Contact</a>
          <button
            onClick={() => {
              setMobileNavOpen(false);
              navigate('/login');
            }}
            className="w-full text-left py-1.5 font-semibold text-[#FF8A32]"
          >
            Sign In to Role Portal →
          </button>
        </div>
      )}

      {/* 4.2 HERO SECTION */}
      <section className="relative border-b border-neutral-800 overflow-hidden">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 pt-12 pb-10 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Left Copy Column */}
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-semibold text-[#F97316] tracking-widest uppercase mb-3">
                Disruption Intelligence · Intelligent Recovery · Smarter Manufacturing
              </p>
              <h1
                className="text-3xl sm:text-4xl lg:text-[2.85rem] font-bold text-[#F9FAFB] leading-[1.12] tracking-tight max-w-2xl"
              >
                Don&apos;t Just Detect Factory Disruptions. Recover From Them.
              </h1>
              <p className="text-base text-neutral-300 mt-5 leading-relaxed max-w-xl">
                One connected platform for workforce coordination, machine monitoring, production visibility, safety and intelligent disruption recovery.
              </p>

              <div className="flex flex-wrap items-center gap-3.5 mt-8">
                <a
                  href="#recovery"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-[#F97316] text-[#111827] rounded-md hover:bg-[#ea580c] transition-colors whitespace-nowrap shrink-0 shadow-md"
                >
                  Explore Recovery Engine
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#platform"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#F9FAFB] bg-[#1F2937] border border-neutral-700 rounded-md hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Explore Factory Operations
                </a>
              </div>

              <div className="mt-8 pt-6 border-t border-neutral-800/90 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
                <span>Role-Verified Access Control</span>
                <span aria-hidden="true">·</span>
                <span>Rule-Based Recovery Engine</span>
                <span aria-hidden="true">·</span>
                <span>Zero Hardware Dependencies</span>
              </div>
            </div>

            {/* Right Layered Industrial Visual + Live Operational Preview */}
            <div className="lg:col-span-6 relative min-h-[360px] rounded-lg overflow-hidden border border-neutral-800 bg-[#242A33]">
              <ResilientImage
                src={INDUSTRIAL_ASSETS.heroFloor}
                alt="Modern precision manufacturing floor at Northstar Manufacturing Works"
                className="w-full h-full object-cover min-h-[360px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#171A21] via-[#171A21]/55 to-transparent" />

              <div className="absolute bottom-4 left-4 right-4 bg-[#171A21]/92 backdrop-blur-sm border border-neutral-700/80 rounded-lg p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-neutral-400 pb-2.5 border-b border-neutral-800">
                  <span className="font-semibold text-[#F5F6F8]">
                    {pulse.factoryName} ({pulse.factoryCode})
                  </span>
                  <span>
                    {pulse.isDemonstrationDataset ? 'Live Connected Database · Demo Seed' : 'Live Database State'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                  <div>
                    <p className="text-[11px] text-neutral-400">Active Workforce</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-[#F5F6F8] mt-0.5">
                      {pulse.activeWorkforce}/{pulse.totalWorkforce}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-neutral-400">Operating Machines</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-[#19C6B4] mt-0.5">
                      {pulse.operatingMachines}/{pulse.totalMachines}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-neutral-400">Order Achievement</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-[#FF8A32] mt-0.5">
                      {pulse.productionAchievementPct}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-neutral-400">Pending Maintenance</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-[#F59E0B] mt-0.5">
                      {pulse.pendingMaintenance}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4.3 PROBLEM SECTION */}
      <section id="about" className="py-16 lg:py-20 border-b border-neutral-800 bg-[#14171D]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5">
              <p className="text-xs font-medium text-[#FF8A32] mb-2">Operational Bottlenecks</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F6F8] leading-tight">
                Disconnected Factory Operations Create Unnecessary Complexity.
              </h2>
              <p className="text-sm text-neutral-300 mt-4 leading-relaxed">
                When shift rosters, machine logs, production orders, and maintenance tickets live in separate spreadsheets, floor supervisors lose critical hours reacting to avoidable disruptions.
              </p>
              <div className="mt-6 rounded-lg overflow-hidden border border-neutral-800">
                <ResilientImage
                  src={INDUSTRIAL_ASSETS.workforceOps}
                  alt="Industrial engineers reviewing component tolerances on the shop floor"
                  className="w-full aspect-[4/3] object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-7 divide-y divide-neutral-800 border border-neutral-800 rounded-lg bg-[#1C2028]">
              {[
                {
                  num: '01.',
                  title: 'Workforce Allocation Inefficiency',
                  desc: 'Skilled machinists and certified welders sit underutilized or face shift overlaps because supervisors lack real-time visibility into operator qualifications and attendance.',
                },
                {
                  num: '02.',
                  title: 'Unplanned Machine Downtime',
                  desc: 'When a primary bay halts mid-shift, identifying compatible idle equipment and transferring production tasks manually stalls downstream assembly.',
                },
                {
                  num: '03.',
                  title: 'Poor Production Visibility',
                  desc: 'Delayed paper shift logs hide batch bottlenecks until deadlines are already missed, leaving managers unable to rebalance workloads proactively.',
                },
                {
                  num: '04.',
                  title: 'Delayed Maintenance Responses',
                  desc: 'Verbal fault reports fail to capture priority, affected production orders, or diagnostic history, slowing down technician dispatch and machine turnarounds.',
                },
                {
                  num: '05.',
                  title: 'Disconnected Safety Reporting',
                  desc: 'Shop-floor hazards logged without structured corrective owners or target dates remain unresolved and disconnected from department operations.',
                },
              ].map((item) => (
                <div key={item.num} className="p-5 sm:p-6 flex items-start gap-4">
                  <span className="font-mono text-xs font-semibold text-[#FF8A32] pt-1 shrink-0">{item.num}</span>
                  <div>
                    <h3 className="text-base font-semibold text-[#F5F6F8]">{item.title}</h3>
                    <p className="text-sm text-neutral-400 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4.4 SOLUTION SECTION — Connected Visual Workflow */}
      <section id="platform" className="py-16 lg:py-20 border-b border-neutral-800">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-[#19C6B4] mb-2">Unified Operational Spine</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F6F8]">
              One Connected Platform. Complete Factory Visibility.
            </h2>
            <p className="text-sm text-neutral-300 mt-3 leading-relaxed">
              Every state change propagates across all four authorized role portals—linking resource registration directly to floor execution and recovery.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { step: '01', name: 'Workforce Management', meta: 'Skills · Certs · Attendance' },
              { step: '02', name: 'Shift Planning', meta: 'Morning · Afternoon · Night' },
              { step: '03', name: 'Machine Management', meta: 'Capacity · Status · Logs' },
              { step: '04', name: 'Production Monitoring', meta: 'Orders · Tasks · Output' },
              { step: '05', name: 'Safety Management', meta: 'Hazards · Corrective Actions' },
              { step: '06', name: 'Maintenance Management', meta: 'Diagnosis · Repair · Restore' },
            ].map((cap, idx) => (
              <div
                key={cap.step}
                className="bg-[#242A33] border border-neutral-800 rounded-lg p-4 flex flex-col justify-between relative"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                    <span className="text-[#19C6B4] font-semibold">Stage {cap.step}</span>
                    {idx < 5 && <ArrowRight className="w-3.5 h-3.5 text-neutral-500 hidden lg:block" />}
                  </div>
                  <h3 className="text-sm font-semibold text-[#F5F6F8] mt-3">{cap.name}</h3>
                </div>
                <p className="text-xs text-neutral-400 mt-4 pt-3 border-t border-neutral-700/60">{cap.meta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4.5 INTELLIGENT RECOVERY SECTION — Interactive Simulated Fault Walkthrough */}
      <section id="recovery" className="py-16 lg:py-20 border-b border-neutral-800 bg-[#14171D]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
            <div className="max-w-2xl">
              <p className="text-xs font-medium text-[#FF8A32] mb-2">Decision-Support Architecture</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F6F8]">
                Recover Faster. Make Smarter Operational Decisions.
              </h2>
              <p className="text-sm text-neutral-300 mt-3 leading-relaxed">
                When an unexpected fault halts a critical bay, the Factory Recovery Engine evaluates hard eligibility constraints (skills, safety certifications, shift availability, and machine compatibility) before scoring recovery options on a transparent 0–100 scale.
              </p>
            </div>
            <div className="shrink-0">
              <button
                onClick={() => setSimTriggered((s) => !s)}
                className="px-5 py-2.5 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] transition-colors whitespace-nowrap"
              >
                {simTriggered ? 'Reset Simulated Fault Example' : 'Simulate Machine Fault Demo'}
              </button>
            </div>
          </div>

          {/* 6-Step Sequence Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            {[
              '1. Machine Fault',
              '2. Impact Identification',
              '3. Resource Evaluation',
              '4. Alternative Allocation',
              '5. Manager Approval',
              '6. Production Recovery',
            ].map((label, idx) => {
              const active = simTriggered || idx === 0;
              return (
                <div
                  key={label}
                  className={`px-3.5 py-2.5 rounded-md border text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#242A33] border-[#FF8A32]/60 text-[#F5F6F8]'
                      : 'bg-[#1A1E26] border-neutral-800 text-neutral-400'
                  }`}
                >
                  {label}
                </div>
              );
            })}
          </div>

          {/* Interactive Simulated Demonstration Box */}
          <div className="bg-[#1E232C] border border-neutral-700/80 rounded-lg p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-neutral-800 text-xs">
              <span className="text-neutral-300 font-medium">
                Interactive Demonstration · Clearly Labelled Simulated Example (Non-Hardware Software Workflow)
              </span>
              <span className="font-mono text-[#19C6B4]">
                Weights: Skill 35% · Availability 25% · Machine 20% · Priority 10% · Efficiency 10%
              </span>
            </div>

            {!simTriggered ? (
              <div className="py-8 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-base font-semibold text-[#F5F6F8]">
                    Ready to Test: Simulated Servo Fault on Robotic Weld Bay W1 (MCH-WLD-201)
                  </h3>
                  <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
                    Click &ldquo;Simulate Machine Fault Demo&rdquo; above to inspect how FactoryPulse isolates impacted orders, filters unqualified personnel, compares single-bay alternatives, and executes dual-stream combined parallel recovery.
                  </p>
                </div>
                <button
                  onClick={() => setSimTriggered(true)}
                  className="px-4 py-2 text-xs font-semibold bg-[#242A33] border border-[#FF8A32] text-[#FF8A32] rounded-md hover:bg-[#FF8A32] hover:text-[#171A21] transition-colors whitespace-nowrap shrink-0"
                >
                  Run Simulated Fault
                </button>
              </div>
            ) : (
              <div className="space-y-5 pt-4">
                {/* Impact Identification Header */}
                <div className="bg-[#171A21] border border-neutral-800 rounded-md p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-[#EF4444]">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Impact Detected: MCH-WLD-201 Halted (Servo Actuator Fault)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 font-mono text-neutral-300">
                      <span>Order: <strong className="text-[#F59E0B]">PO-2026-801</strong></span>
                      <span>Remaining: <strong className="text-white">128 Subframes</strong></span>
                      <span>Unmitigated Delay: <strong className="text-[#EF4444]">3.7 hrs</strong></span>
                    </div>
                  </div>
                </div>

                {/* Strategy Selector Tabs */}
                <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setSimStrategy('combined')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                      simStrategy === 'combined'
                        ? 'bg-[#19C6B4] text-[#171A21]'
                        : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                    }`}
                  >
                    <Split className="w-3.5 h-3.5" />
                    <span>Combined Solution (Dual-Stream)</span>
                    <span className="text-[10px] px-1 bg-[#171A21]/30 rounded font-mono">56% Faster</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimStrategy('compare')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                      simStrategy === 'compare'
                        ? 'bg-[#FF8A32] text-[#171A21]'
                        : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>Compare Option A vs B</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimStrategy('optionA')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                      simStrategy === 'optionA'
                        ? 'bg-neutral-200 text-[#171A21]'
                        : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Option A (Primary)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimStrategy('optionB')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                      simStrategy === 'optionB'
                        ? 'bg-neutral-200 text-[#171A21]'
                        : 'text-neutral-300 hover:bg-[#242A33] hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Option B (Secondary)</span>
                  </button>
                </div>

                {/* Tab 1: COMBINED SOLUTION */}
                {simStrategy === 'combined' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Stream A */}
                      <div className="bg-[#171A21] border border-[#19C6B4]/40 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2 text-xs">
                          <span className="font-bold text-[#19C6B4] flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5" />
                            Stream A: Lead Precision Batch
                          </span>
                          <span className="font-mono px-2 py-0.5 bg-[#19C6B4]/10 text-[#19C6B4] rounded font-semibold tabular-nums">
                            74 units (58%)
                          </span>
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <p className="font-semibold text-white">MCH-WLD-202 (Robotic Weld Bay W2)</p>
                          <p className="text-neutral-400">
                            Operator: <span className="text-white font-medium">Rohan Suryavanshi</span> (AWS D1.1 Certified, L5/5)
                          </p>
                          <p className="text-neutral-400">
                            Hourly Run Rate: <span className="font-mono text-white tabular-nums">36 units/hr</span>
                          </p>
                        </div>
                      </div>

                      {/* Stream B */}
                      <div className="bg-[#171A21] border border-[#FF8A32]/40 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2 text-xs">
                          <span className="font-bold text-[#FF8A32] flex items-center gap-1.5">
                            <GitBranch className="w-3.5 h-3.5" />
                            Stream B: Parallel Continuous Batch
                          </span>
                          <span className="font-mono px-2 py-0.5 bg-[#FF8A32]/10 text-[#FF8A32] rounded font-semibold tabular-nums">
                            54 units (42%)
                          </span>
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <p className="font-semibold text-white">MCH-WLD-203 (Robotic Weld Bay W3)</p>
                          <p className="text-neutral-400">
                            Operator: <span className="text-white font-medium">Divya Subramanian</span> (ISO 9606-1 Certified, L4/5)
                          </p>
                          <p className="text-neutral-400">
                            Hourly Run Rate: <span className="font-mono text-white tabular-nums">32 units/hr</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Combined Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#171A21] border border-neutral-800 rounded-md p-3.5 text-center font-mono tabular-nums text-xs">
                      <div>
                        <span className="text-neutral-400 block font-sans">Combined Capacity</span>
                        <span className="text-sm font-bold text-[#22C55E]">68 u/hr</span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block font-sans">Projected Delay</span>
                        <span className="text-sm font-bold text-[#19C6B4]">0.4 hrs</span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block font-sans">Delay Reduction</span>
                        <span className="text-sm font-bold text-[#22C55E]">56% Faster</span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block font-sans">Single Bay Risk</span>
                        <span className="text-sm font-bold text-[#22C55E]">0% (Redundant)</span>
                      </div>
                    </div>

                    <div className="p-3 bg-[#171A21] border border-neutral-800 rounded text-xs text-neutral-300 leading-relaxed">
                      <strong className="text-white">Why Dual-Stream Parallel Recovery wins: </strong>
                      Splitting remaining work across both qualified idle bays restores delivery schedule 56% faster than single-bay reallocation while staying within standard operator fatigue and shift limits.
                    </div>
                  </div>
                )}

                {/* Tab 2: COMPARE OPTION A VS B */}
                {simStrategy === 'compare' && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#171A21] text-neutral-300 border border-neutral-800">
                          <tr>
                            <th className="py-2 px-3 text-left">Metric</th>
                            <th className="py-2 px-3 text-left text-[#19C6B4]">Option A (Primary)</th>
                            <th className="py-2 px-3 text-left text-[#FF8A32]">Option B (Secondary)</th>
                            <th className="py-2 px-3 text-right">Advantage / Delta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800 border border-neutral-800">
                          <tr>
                            <td className="py-2 px-3 text-neutral-400">Score</td>
                            <td className="py-2 px-3 font-mono font-bold text-[#19C6B4] tabular-nums">96.2 / 100</td>
                            <td className="py-2 px-3 font-mono font-bold text-[#FF8A32] tabular-nums">91.8 / 100</td>
                            <td className="py-2 px-3 text-right font-mono text-[#22C55E] tabular-nums">+4.4 pts (Option A)</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 text-neutral-400">Target Bay</td>
                            <td className="py-2 px-3 font-mono text-white">MCH-WLD-202 (36 u/hr)</td>
                            <td className="py-2 px-3 font-mono text-white">MCH-WLD-203 (32 u/hr)</td>
                            <td className="py-2 px-3 text-right text-[#22C55E]">+12.5% throughput</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 text-neutral-400">Operator</td>
                            <td className="py-2 px-3 text-white">Rohan Suryavanshi (L5/5)</td>
                            <td className="py-2 px-3 text-white">Divya Subramanian (L4/5)</td>
                            <td className="py-2 px-3 text-right text-neutral-300">L5 Master certified</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 text-neutral-400">Setup Time</td>
                            <td className="py-2 px-3 font-mono text-white tabular-nums">20 mins</td>
                            <td className="py-2 px-3 font-mono text-white tabular-nums">25 mins</td>
                            <td className="py-2 px-3 text-right font-mono text-[#22C55E] tabular-nums">5 min faster</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 text-neutral-400">Projected Delay</td>
                            <td className="py-2 px-3 font-mono text-[#22C55E] tabular-nums font-semibold">0.9 hrs</td>
                            <td className="py-2 px-3 font-mono text-white tabular-nums">1.2 hrs</td>
                            <td className="py-2 px-3 text-right font-mono text-[#22C55E] tabular-nums font-semibold">18 min faster recovery</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 text-neutral-400">Single-Bay Risk</td>
                            <td className="py-2 px-3 text-neutral-400">Single Bay Dependency</td>
                            <td className="py-2 px-3 text-neutral-400">Single Bay Dependency</td>
                            <td className="py-2 px-3 text-right text-neutral-400">Run both in parallel!</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 3: PREVIEW OPTION A */}
                {simStrategy === 'optionA' && (
                  <div className="bg-[#171A21] border border-neutral-800 rounded-lg p-4 space-y-3 text-xs">
                    <div className="flex justify-between items-center pb-2 border-b border-neutral-800">
                      <div>
                        <span className="font-mono text-[10px] font-bold text-[#19C6B4] px-1.5 py-0.5 bg-[#19C6B4]/15 rounded">
                          PRIMARY OPTION A
                        </span>
                        <h4 className="text-sm font-semibold text-white mt-1">
                          MCH-WLD-202 (Robotic Weld Bay W2) ← Rohan Suryavanshi
                        </h4>
                      </div>
                      <span className="text-lg font-bold font-mono text-[#19C6B4] tabular-nums">96.2 / 100</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-300">
                      <div>
                        <p className="font-semibold text-white mb-1">Asset Capabilities:</p>
                        <p>· 36 units/hr continuous seam rate</p>
                        <p>· WLD-FIXT-04 clamp jig pre-fitted</p>
                        <p>· Setup timeline: 20 minutes</p>
                      </div>
                      <div>
                        <p className="font-semibold text-white mb-1">Operator Certification:</p>
                        <p>· Rohan Suryavanshi (EMP-1002)</p>
                        <p>· AWS D1.1 Structural Robotic Welder</p>
                        <p>· Level 5/5 Master Proficiency</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-neutral-800 flex justify-between font-mono text-neutral-400 tabular-nums">
                      <span>Batch Volume: 128 units</span>
                      <span>Projected Delay: <strong className="text-[#22C55E]">0.9 hrs</strong></span>
                      <span>Delivery: Within Shift 1</span>
                    </div>
                  </div>
                )}

                {/* Tab 4: PREVIEW OPTION B */}
                {simStrategy === 'optionB' && (
                  <div className="bg-[#171A21] border border-neutral-800 rounded-lg p-4 space-y-3 text-xs">
                    <div className="flex justify-between items-center pb-2 border-b border-neutral-800">
                      <div>
                        <span className="font-mono text-[10px] font-bold text-[#FF8A32] px-1.5 py-0.5 bg-[#FF8A32]/15 rounded">
                          SECONDARY OPTION B
                        </span>
                        <h4 className="text-sm font-semibold text-white mt-1">
                          MCH-WLD-203 (Robotic Weld Bay W3) ← Divya Subramanian
                        </h4>
                      </div>
                      <span className="text-lg font-bold font-mono text-[#FF8A32] tabular-nums">91.8 / 100</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-300">
                      <div>
                        <p className="font-semibold text-white mb-1">Asset Capabilities:</p>
                        <p>· 32 units/hr continuous seam rate</p>
                        <p>· Dual-axis rotary clamp (requires minor offset)</p>
                        <p>· Setup timeline: 25 minutes</p>
                      </div>
                      <div>
                        <p className="font-semibold text-white mb-1">Operator Certification:</p>
                        <p>· Divya Subramanian (EMP-1006)</p>
                        <p>· ISO 9606-1 Fusion Welding Certified</p>
                        <p>· Level 4/5 Advanced Proficiency</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-neutral-800 flex justify-between font-mono text-neutral-400 tabular-nums">
                      <span>Batch Volume: 128 units</span>
                      <span>Projected Delay: <strong className="text-white">1.2 hrs</strong></span>
                      <span>Delivery: Shift 1 Tail</span>
                    </div>
                  </div>
                )}

                {/* Bottom Manager Authority Strip */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-neutral-800">
                  <div className="text-xs text-neutral-400">
                    <strong className="text-white">Manager Governance Enforced: </strong>
                    All reallocations, split batches, and worker assignments require human approval before database commit.
                  </div>
                  <button
                    onClick={() => navigate('/login')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] transition-colors whitespace-nowrap shrink-0"
                  >
                    Open Live Recovery Engine <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4.6 HOW IT WORKS */}
      <section id="how-it-works" className="py-16 lg:py-20 border-b border-neutral-800">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium text-[#19C6B4] mb-2">End-to-End Execution Lifecycle</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F6F8]">How FactoryPulse IntelliOps Works</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            {[
              { step: '01', title: 'Register Factory Resources', body: 'Configure plant departments, operating schedules, machines, and skill catalogs.' },
              { step: '02', title: 'Manage Workforce & Shifts', body: 'Verify worker certifications, check attendance, and build conflict-free shift rosters.' },
              { step: '03', title: 'Plan Production', body: 'Create prioritized production orders with target quantities, deadlines, and assigned bays.' },
              { step: '04', title: 'Monitor Operations', body: 'Track real-time batch output, machine utilization, and operator progress submissions.' },
              { step: '05', title: 'Identify Operational Problems', body: 'Capture frontline machine faults, safety hazards, or unplanned operator absences immediately.' },
              { step: '06', title: 'Generate Recovery Options', body: 'Run rule-based constraint matching to surface eligible backup machines and workers.' },
              { step: '07', title: 'Review Factory Performance', body: 'Audit historical throughput, downtime logs, safety closures, and CSV reports.' },
            ].map((s) => (
              <div key={s.step} className="bg-[#242A33] border border-neutral-800 rounded-lg p-4">
                <span className="font-mono text-xs font-bold text-[#FF8A32]">{s.step}</span>
                <h3 className="text-sm font-semibold text-[#F5F6F8] mt-2">{s.title}</h3>
                <p className="text-xs text-neutral-400 mt-2 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4.7 PLATFORM FEATURES (8 Main Modules) */}
      <section id="features" className="py-16 lg:py-20 border-b border-neutral-800 bg-[#14171D]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium text-[#FF8A32] mb-2">Eight Integrated Modules</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F6F8]">
              Complete Industrial Capabilities Without Fragmented Silos
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLATFORM_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.id}
                  className="bg-[#1E232C] border border-neutral-800 rounded-lg overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="h-36 overflow-hidden border-b border-neutral-800 relative">
                      <ResilientImage src={mod.image} alt={mod.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1E232C] via-transparent to-transparent" />
                    </div>
                    <div className="p-5">
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-[#FF8A32] shrink-0" />
                        <h3 className="text-base font-semibold text-[#F5F6F8]">{mod.title}</h3>
                      </div>
                      <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">{mod.desc}</p>
                    </div>
                  </div>
                  <div className="px-5 pb-4">
                    <button
                      onClick={() => setSelectedModule(mod)}
                      className="text-xs font-semibold text-[#19C6B4] hover:underline inline-flex items-center gap-1"
                    >
                      Learn More <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4.8 BENEFITS SECTION (Zero unsupported percentage claims) */}
      <section id="benefits" className="py-16 lg:py-20 border-b border-neutral-800">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <p className="text-xs font-medium text-[#19C6B4] mb-2">Operational Value</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F6F8]">
                Engineered for Practical Shop-Floor Coordination
              </h2>
              <p className="text-sm text-neutral-300 mt-3 leading-relaxed">
                FactoryPulse IntelliOps focuses on verifiable operational discipline—ensuring every machine assignment, maintenance sign-off, and recovery decision is backed by accurate records.
              </p>
              <div className="mt-6 rounded-lg overflow-hidden border border-neutral-800">
                <ResilientImage
                  src={INDUSTRIAL_ASSETS.cncMachinery}
                  alt="5-Axis CNC machining center and hydraulic press bay"
                  className="w-full aspect-[4/3] object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: 'Better Workforce Utilization',
                  body: 'Match operators to equipment based on verified skill proficiency levels and active safety certifications rather than guesswork.',
                },
                {
                  title: 'Improved Production Visibility',
                  body: 'Track order progress, batch completions, and shift downtime from one shared source of truth accessible to authorized managers.',
                },
                {
                  title: 'Faster Fault Response',
                  body: 'Route worker machine fault submissions simultaneously to maintenance technicians and the manager recovery queue.',
                },
                {
                  title: 'Organized Maintenance',
                  body: 'Maintain structured diagnostic notes, spare parts logs, preventive calendars, and formal service completion history per asset.',
                },
                {
                  title: 'Improved Operational Coordination',
                  body: 'Eliminate communication gaps between administrators, floor managers, line workers, and maintenance personnel.',
                },
                {
                  title: 'Data-Driven Management Decisions',
                  body: 'Test disruption hypotheses safely inside the Scenario Simulator before committing real workforce or machine changes.',
                },
              ].map((b) => (
                <div key={b.title} className="bg-[#242A33] border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-[#F5F6F8]">{b.title}</h3>
                  <p className="text-xs text-neutral-400 mt-2 leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT & 4.9 FINAL CTA */}
      <section id="contact" className="py-16 lg:py-20 border-b border-neutral-800 bg-[#14171D]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-6 flex flex-col justify-between bg-[#242A33] border border-neutral-800 rounded-lg p-8">
            <div>
              <p className="text-xs font-medium text-[#FF8A32] mb-2">Deploy Connected Operations</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F6F8]">
                Bring Your Entire Factory Operation Together.
              </h2>
              <p className="text-sm text-neutral-300 mt-3 leading-relaxed">
                Sign in with any of the four role-verified demonstration portals (Administrator, Factory Manager, Worker, or Maintenance Technician) to experience real interconnected workflows.
              </p>
            </div>
            <div className="mt-8">
              <button
                onClick={() => navigate('/login')}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f] transition-colors whitespace-nowrap"
              >
                Get Started with FactoryPulse
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 bg-[#1C2129] border border-neutral-800 rounded-lg p-8">
            <h3 className="text-lg font-semibold text-[#F5F6F8]">Contact Industrial Operations Team</h3>
            <p className="text-xs text-neutral-400 mt-1">
              Request enterprise deployment specifications or multi-plant configuration guidance.
            </p>
            {contactSubmitted ? (
              <div className="mt-6 p-4 bg-[#242A33] border border-[#22C55E]/40 rounded-md text-xs text-neutral-200">
                Thank you. Your inquiry has been logged for enterprise follow-up.
                <button
                  onClick={() => setContactSubmitted(false)}
                  className="block mt-2 text-[#19C6B4] underline"
                >
                  Send another inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3.5 mt-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Aarav Mehta"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">Work Email</label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="aarav@plant-ops.org"
                      className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-300 mb-1">Facility / Organization</label>
                  <input
                    type="text"
                    value={contactOrg}
                    onChange={(e) => setContactOrg(e.target.value)}
                    placeholder="Precision Drivetrain Works"
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-300 mb-1">Operational Requirements</label>
                  <textarea
                    rows={3}
                    required
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    placeholder="Number of departments, shift structure, and primary production lines..."
                    className="w-full px-3 py-2 bg-[#171A21] border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:border-[#FF8A32]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-[#242A33] border border-neutral-600 text-white rounded-md hover:bg-neutral-700 transition-colors"
                >
                  Submit Operational Inquiry
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* 4.10 QUIET ENTERPRISE FOOTER */}
      <footer className="bg-[#12151B] py-12 px-4 sm:px-8 text-xs text-neutral-400">
        <div className="max-w-[1360px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-neutral-800">
          <div className="md:col-span-1">
            <FactoryPulseLogo size="sm" />
            <p className="mt-3 leading-relaxed text-neutral-400">
              Software-defined industrial operations management and transparent rule-based factory recovery platform.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[#F5F6F8] mb-2.5">Platform</p>
            <ul className="space-y-2">
              <li><a href="#platform" className="hover:text-white">Connected Workflow</a></li>
              <li><a href="#recovery" className="hover:text-white">Intelligent Recovery Engine</a></li>
              <li><a href="#how-it-works" className="hover:text-white">How It Works</a></li>
              <li><button onClick={() => navigate('/login')} className="hover:text-white">Role-Based Portal Login</button></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#F5F6F8] mb-2.5">Core Modules</p>
            <ul className="space-y-2">
              <li><a href="#features" className="hover:text-white">Workforce & Shift Planning</a></li>
              <li><a href="#features" className="hover:text-white">Machine & Production Control</a></li>
              <li><a href="#features" className="hover:text-white">Workplace Safety & Audits</a></li>
              <li><a href="#features" className="hover:text-white">Maintenance Service Dispatch</a></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#F5F6F8] mb-2.5">Contact & Governance</p>
            <p>Sector 14 Industrial Corridor, Pune</p>
            <p className="mt-1">ops-support@factorypulse.demo</p>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={() => setLegalModal('privacy')} className="hover:text-white underline">Privacy Policy</button>
              <span>·</span>
              <button onClick={() => setLegalModal('terms')} className="hover:text-white underline">Terms & Conditions</button>
            </div>
          </div>
        </div>
        <div className="max-w-[1360px] mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-neutral-500">
          <p>© 2026 FactoryPulse IntelliOps. NavUtkarsh × Leo Hackathon 2026 — Problem Statement 04.</p>
          <p>Software-Only Operational Platform · No External Hardware Required</p>
        </div>
      </footer>

      {/* Module Detail Modal */}
      {selectedModule && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#242A33] border border-neutral-700 rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-700">
              <h3 className="text-lg font-semibold text-[#F5F6F8]">{selectedModule.title}</h3>
              <button onClick={() => setSelectedModule(null)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-neutral-200 mt-4 leading-relaxed">{selectedModule.desc}</p>
            <p className="text-xs text-neutral-400 mt-3 leading-relaxed">{selectedModule.detail}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setSelectedModule(null)}
                className="px-4 py-2 text-xs font-medium bg-[#171A21] border border-neutral-700 rounded-md text-neutral-300"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedModule(null);
                  navigate('/login');
                }}
                className="px-4 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md"
              >
                Access in Portal →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy / Terms Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#242A33] border border-neutral-700 rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-700">
              <h3 className="text-lg font-semibold text-[#F5F6F8]">
                {legalModal === 'privacy' ? 'FactoryPulse IntelliOps — Privacy Policy' : 'Terms & Operational Conditions'}
              </h3>
              <button onClick={() => setLegalModal(null)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-300 mt-4 leading-relaxed">
              {legalModal === 'privacy'
                ? 'FactoryPulse IntelliOps stores operational workforce schedules, skill qualifications, attendance timestamps, and audit logs strictly for authorized plant administration and operational scheduling. Role-based access ensures personnel data is restricted to authorized supervisory roles.'
                : 'All operational recovery recommendations require explicit review and authorization by an authenticated Factory Manager before execution. Demonstration seed records are clearly labelled for evaluation purposes.'}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setLegalModal(null)}
                className="px-4 py-2 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
