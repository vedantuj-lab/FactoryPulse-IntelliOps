# FactoryPulse IntelliOps — System Architecture Document

**System**: FactoryPulse IntelliOps  
**Problem Statement**: PS-04 – FactoryPulse  
**Domain**: Industry and Safety  

---

## 1. System Context & Overview

FactoryPulse IntelliOps is a software-only Industrial Operations Management Platform connecting shop floor workforce, shift planning, machines, production execution, workplace safety, and maintenance dispatching into one unified system.

```
   ┌─────────────────────────────────────────────────────────────┐
   │                   Unified Landing Page                      │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   │    Role-Based Authentication│
                   └──────────────┬──────────────┘
                                  │
    ┌─────────────────┬───────────┴───────────┬─────────────────┐
    ▼                 ▼                       ▼                 ▼
┌─────────┐   ┌───────────────┐     ┌──────────────────┐  ┌───────────┐
│ Admin   │   │ Factory       │     │ Floor            │  │ Maint.    │
│ Portal  │   │ Manager       │     │ Worker           │  │ Technician│
└────┬────┘   └───────┬───────┘     └────────┬─────────┘  └─────┬─────┘
     │                │                      │                  │
     └────────────────┴───────────┬──────────┴──────────────────┘
                                  │
                  ┌───────────────▼───────────────┐
                  │ Unified Express REST Backend  │
                  └───────────────┬───────────────┘
                                  │
                  ┌───────────────▼───────────────┐
                  │ SQLite Database (better-sqlite)│
                  └───────────────────────────────┘
```

---

## 2. Core Architectural Subsystems

### A. Disruption-Aware Intelligent Factory Recovery Engine
Located in `server/recoveryEngine.ts` & `src/pages/RecoveryEnginePage.tsx`:
1. **Disruption Intake**: Captures machine faults, worker absences, order delays, and maintenance outages.
2. **Minimal-Change Filtering**: Identifies specifically affected tasks and isolates unaffected tasks running on operating equipment.
3. **Hard Constraint Guard**: Evaluates 5 mandatory constraints:
   - Worker active & available
   - Required skill code & proficiency
   - Valid, non-expired safety certification
   - Machine operational status (`OPERATING`/`IDLE`, `utilization < 85%`, `status != FAULT`, `status != MAINTENANCE`, `status != VERIFICATION_REQUIRED`)
   - Zero active task conflicts on operating machines
4. **Deterministic Scoring**:
   $$\text{Total Score} = (\text{Skill} \times 35\%) + (\text{Availability} \times 25\%) + (\text{Machine} \times 20\%) + (\text{Priority} \times 10\%) + (\text{Efficiency} \times 10\%)$$
5. **Side-by-Side Plan Comparison**: Contrasts Original Halted Plan vs Proposed Recovery Plan.
6. **Stale Approval Guard**: Re-validates resource availability inside a SQLite transaction upon manager approval.

### B. Maintenance Verification & Repair Subsystem
1. Worker/System logs machine fault -> Machine status = `FAULT`.
2. Technician receives dispatch -> Diagnoses & completes repair.
3. Machine status enters `VERIFICATION_REQUIRED` (ineligible for production assignments).
4. Manager reviews repair report -> Approves (`restoreMachineStatus: OPERATIONAL`) or Rejects (returns to technician queue).

### C. Automatic Mandatory Alert Engine
Evaluates 5 mandatory alert categories:
- `PRODUCTION_BELOW_TARGET`
- `EXCESSIVE_MACHINE_DOWNTIME`
- `WORKER_SHORTAGE`
- `UPCOMING_MAINTENANCE`
- `SAFETY_INCIDENT`
Uses 12-hour window deduplication to prevent repetitive alert creation.

### D. Non-Destructive Scenario Simulator Sandbox
Runs scenario stress tests in-memory, storing snapshots in `simulation_scenarios` and `simulation_results` without modifying live production assignments, attendance, or machine records. Converts to proposal on demand.

---

## 3. Database Schema Entity Relationships

```
Factory (1) ───< Department (N) ───< User (N) ───< Worker (1:1)
   │                  │                                │
   ├───< Machine (N) ─┼───< Shift (N)                  ├───< WorkerSkill (N)
   │          │       │      │                         └───< Certification (N)
   │          │       │      └───< ShiftAssignment (N)
   │          │       │
   └───< ProductionOrder (N) ───< ProductionTask (N) [parent_task_id -> ProductionTask]
              │
              ├───< QualityInspection (N)
              └───< MachineAssignment (N)
```

---

## 4. Security Architecture

* **Authentication**: Bearer token session authentication (`sessions` table with expiration check).
* **Password Security**: `scrypt` salt-and-hash (`crypto.scryptSync`).
* **RBAC Enforcement**: Server-side middleware `requireRoles('ADMIN', 'MANAGER', 'WORKER', 'TECHNICIAN')` protecting all REST routes.
* **Input Validation**: Required fields, numeric boundaries, date syntax, and employee verification.
* **Audit Logging**: Immutable audit entries logged for all administrative, operational, recovery, and maintenance actions (`audit_logs` table).
