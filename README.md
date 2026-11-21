# FactoryPulse IntelliOps - code NBR8NJ

> **Intelligent Operations. Connected Workforce. Smarter Manufacturing.**

[![Hackathon](https://img.shields.io/badge/Hackathon-NavUtkarsh%20%C3%97%20Leo%20Hackathon%202026-orange)](#)
[![Problem Statement](https://img.shields.io/badge/Problem%20Statement-04%20%E2%80%93%20FactoryPulse-teal)](#)
[![Stack](https://img.shields.io/badge/Stack-React%2019%20%7C%20TypeScript%20%7C%20Express%20%7C%20SQLite-blue)](#)
[![License](https://img.shields.io/badge/License-MIT-green)](#)

---

## 📌 Project Identity

* **Project Name**: FactoryPulse IntelliOps
* **Tagline**: Intelligent Operations. Connected Workforce. Smarter Manufacturing.
* **Hackathon**: NavUtkarsh × Leo Hackathon 2026
* **Selected Problem Statement**: Problem Statement 04 – FactoryPulse
* **Team Name**: Tech Dynamites
* **Team Leader**: Vedant Dalvi
* **Team Members**: Prince Gupta, Sumit Kade
* **College**: Shree L.R. Tiwari College of Engineering

---

## 🚀 Overview

**FactoryPulse IntelliOps** is a software-based Industrial Operations Management Platform designed to unify factory workforce, shifts, machines, production, safety, and maintenance under one centralized application.

The platform eliminates fragmented operations (spreadsheets, paper shift logs, verbal fault reports) and provides managers with a unified operational view.

### Key Innovation: Intelligent Factory Recovery Engine
When machine failures, worker absences, or production bottlenecks occur, the **Intelligent Factory Recovery Engine** evaluates hard eligibility constraints (skills, active safety certifications, shift availability, and machine capabilities) and scores backup options using transparent, explainable algorithms (0–100 scale).

> ⚠️ **Important Project Guarantee**: This is a **100% software-based platform**. It does **not** require external hardware, IoT sensors, RFID tags, CCTV, or black-box LLMs. All operational recommendations are rule-based, deterministic, and explainable.

---

## 🛠️ Architecture & Technology Stack

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

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts.
* **Backend**: Express.js, TypeScript, Node.js.
* **Database**: SQLite (`better-sqlite3`) with WAL journal mode, foreign key constraints, and relational schema.
* **Security**: Scrypt password hashing, Bearer token session authentication, server-side RBAC middleware, and rate-limiting.

---

## 🔑 Role-Based Access Control (RBAC)

The application provides four role-based dashboard experiences:

| Role | Color Identity | Scope & Features | Demo Account |
| :--- | :--- | :--- | :--- |
| **Administrator** | Charcoal + Industrial Orange (`#FF8A32`) | Factory configuration, departments, user provisioning, machine registry, skills matrix, CSV import/export, audit logs, demo environment | `admin@factorypulse.demo` |
| **Factory Manager** | Graphite + Teal (`#19C6B4`) | Operational Command Center, workforce management, shift rosters & handover, machine management, production control, quality inspections, safety, maintenance dispatch, Bottleneck Analysis, Recovery Engine, Scenario Simulator | `manager@factorypulse.demo` |
| **Worker** | Purple + Pink Accent | Personal profile, shift check-in/check-out, assigned production tasks, machine fault reporting, safety reporting, quality entry, shift handover | `worker@factorypulse.demo` |
| **Maintenance Technician** | Dark Green + Emerald (`#10B981`) | Active maintenance queue, fault diagnosis, repair workflow, spare parts logging, downtime recording, status restoration to IDLE, service history | `technician@factorypulse.demo` |

> 🔑 **Demo Password for All Accounts**: `DemoPulse!2026`

---

## ⚡ Key Modules

1. **Landing Page**: Enterprise website featuring live connected telemetry, problem & solution overview, 8 core modules, interactive simulated fault walkthrough, role cards, contact form, and footer legal modals.
2. **Operational Command Center**: Real-time plant health score (0–100), active metrics, event timeline with priority filtering, acknowledgment, and manual event logging.
3. **Workforce & Shift Management**: Skill matrices, safety certification tracking, shift creation, overlap detection, worker check-in/out attendance, and structured shift handover.
4. **Machine & Production Control**: Machine registry, status tracking (`OPERATING`, `IDLE`, `FAULT`, `MAINTENANCE`), production order dispatch, task logging, and integrated quality inspection (`Quality Rate = Accepted / Inspected × 100`).
5. **Intelligent Factory Recovery Engine**:
   $$\text{Score} = (\text{Skill} \times 35\%) + (\text{Availability} \times 25\%) + (\text{Machine} \times 20\%) + (\text{Priority} \times 10\%) + (\text{Efficiency} \times 10\%)$$
   Hard constraint guard matching worker availability, skills, valid certifications, and machine capacity before scoring. Supports dual-stream parallel recovery and manager governance.
6. **Scenario Simulator**: Snapshot sandbox supporting 5 scenario types (Machine Failure, Worker Absence, Demand Increase, Scheduled Maintenance, Production Delay), 3-way multi-comparison matrix, and conversion to live recovery plans.
7. **Rule-Based Bottleneck Analysis**: Automated constraint detection for workforce shortages, machine capacity gaps, downtime outages, unbalanced allocations, shift staffing shortages, and scheduling conflicts.
8. **CSV Data Management**: Template download, header validation, duplicate detection, import confirmation, and CSV export for workers, machines, and production orders.
9. **Demonstration Suite**: Controlled failure injection (`CNC-01` thermal bearing failure) and demo environment reset.

---

## 🏃 Getting Started

### Prerequisites
* Node.js v18+ or v20+
* npm or bun

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/tech-dynamites/FactoryPulse-IntelliOps.git
   cd FactoryPulse-IntelliOps
   ```

2. **Install dependencies**:
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   The application will start at `http://localhost:3000` (or the port specified by Vite/Express). Seed demonstration data will automatically be populated in `data/factorypulse.db`.

4. **Type Check & Lint**:
   ```bash
   npm run lint
   ```

5. **Build for Production**:
   ```bash
   npm run build
   ```

---

## 🔄 End-to-End Operational Workflow

```
[ Worker Reports Fault ] ──► [ Manager Notified in Command Center ]
                                      │
                                      ▼
[ Technician Assigned Ticket ] ◄─── [ Recovery Engine Ranks Options ]
            │                         │
            ▼                         ▼
[ Repair Completed & Restored ] ◄── [ Manager Approves Allocation ]
```

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

Developed with ❤️ by **Team Tech Dynamites** for **NavUtkarsh × Leo Hackathon 2026**.
