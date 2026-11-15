# FactoryPulse IntelliOps — REST API Documentation

**Base URL**: `http://localhost:3000/api`  
**Authentication Header**: `Authorization: Bearer <session_token>`  

---

## 1. Public & Authentication APIs

### `GET /api/public/pulse-summary`
* **Access**: Public
* **Description**: Aggregated telemetry metrics for the landing page.
* **Response**:
  ```json
  {
    "isDemonstrationDataset": true,
    "factoryName": "Northstar Manufacturing Works",
    "factoryCode": "FAC-NMW-01",
    "activeWorkforce": 27,
    "totalWorkforce": 30,
    "operatingMachines": 8,
    "totalMachines": 12,
    "productionAchievementPct": 65,
    "pendingMaintenance": 4,
    "demoPasswordHint": "DemoPulse!2026"
  }
  ```

### `POST /api/auth/login`
* **Access**: Public (Rate-limited)
* **Body**: `{ "email": "manager@factorypulse.demo", "password": "DemoPulse!2026", "selectedRole": "MANAGER" }`
* **Response**: `{ "token": "<session_token>", "redirectTo": "/manager/dashboard", "user": { ... } }`

### `POST /api/auth/logout`
* **Access**: Authenticated
* **Description**: Invalidates current session token.

### `GET /api/auth/me`
* **Access**: Authenticated
* **Description**: Returns authenticated user profile and assigned role.

### `POST /api/auth/forgot-password`
* **Access**: Public (Rate-limited)
* **Body**: `{ "email": "manager@factorypulse.demo", "employeeCode": "EMP-MGR-001", "newPassword": "NewPassword123" }`
* **Description**: Verifies registered email and employee code before resetting password.

---

## 2. Factory Operational Health & Command Center

### `GET /api/factory/health`
* **Access**: Manager, Admin
* **Description**: Transparent rule-based health indicator (`HEALTHY`, `ATTENTION_REQUIRED`, `CRITICAL`).
* **Response**:
  ```json
  {
    "status": "ATTENTION_REQUIRED",
    "explanation": "4 operational constraints detected across plant lines.",
    "reasonsCount": 4,
    "reasons": [
      {
        "category": "MACHINE_OUTAGE",
        "description": "Machine MCH-WLD-201 (Robotic Weld Bay W1) is unavailable.",
        "affectedDept": "Welding",
        "link": "/manager/dashboard?tab=machines"
      }
    ],
    "recommendedAction": "Review open machine fault queue and rebalance shift rosters."
  }
  ```

### `GET /api/command-center/overview`
* **Access**: Manager, Admin
* **Description**: Real-time operational command center overview metrics, health score, and recent recovery plans.

### `GET /api/command-center/events`
* **Access**: Authenticated
* **Params**: `eventType`, `priority`, `status`, `search`
* **Description**: Operational event timeline with priority filtering.

### `POST /api/command-center/events/:id/acknowledge`
* **Access**: Manager, Admin
* **Description**: Acknowledges active operational event.

---

## 3. Intelligent Factory Recovery Engine APIs

### `POST /api/recovery/recommend`
* **Access**: Manager, Admin
* **Body**:
  ```json
  {
    "eventType": "MACHINE_FAULT",
    "triggerEntityId": "<machine_id>",
    "weights": {
      "skillCompatibility": 35,
      "workerAvailability": 25,
      "machineCompatibility": 20,
      "productionPriority": 10,
      "assignmentEfficiency": 10
    }
  }
  ```
* **Description**: Evaluates hard constraints, scores eligible candidate options (0–100), generates side-by-side Original vs Proposed Plan comparison, and computes dual-stream parallel recovery options.

### `POST /api/recovery/approve`
* **Access**: Manager, Admin
* **Body**: `{ "planId": "<plan_id>", "recommendationId": "<rec_id>" }` or `{ "planId": "<plan_id>", "isCombined": true, "combinedStrategy": { ... } }`
* **Description**: Re-validates resource availability inside a database transaction and executes minimal-change task reassignment. Rejects stale proposals with `409 Conflict`.

### `POST /api/recovery/reject`
* **Access**: Manager, Admin
* **Body**: `{ "planId": "<plan_id>", "reason": "Manager opted to hold batch." }`

### `GET /api/recovery/history`
* **Access**: Manager, Admin
* **Description**: Historical log of generated recovery plans and manager decisions.

---

## 4. Maintenance Management & Verification APIs

### `GET /api/maintenance/requests`
* **Access**: Authenticated
* **Description**: Lists active fault queue, maintenance schedules, and technician dispatches.

### `POST /api/maintenance/requests`
* **Access**: Authenticated (Worker, Manager, Admin)
* **Body**: `{ "machineId": "<id>", "faultCategory": "Servo Overload", "priority": "HIGH", "description": "..." }`
* **Description**: Reports machine fault, sets machine status to `FAULT`, emits notification.

### `POST /api/maintenance/requests/:id/complete`
* **Access**: Technician, Manager, Admin
* **Body**: `{ "diagnosis": "...", "repairNotes": "...", "partsUsed": "...", "restoreMachineStatus": "VERIFICATION_REQUIRED" }`
* **Description**: Logs repair completion report and transitions machine status to `VERIFICATION_REQUIRED`.

### `POST /api/maintenance/requests/:id/verify`
* **Access**: Manager, Admin
* **Body**: `{ "action": "APPROVE" | "REJECT", "verificationNotes": "...", "restoreMachineStatus": "OPERATIONAL" }`
* **Description**: Manager verifies repair report. Approving returns machine to `OPERATIONAL` / `IDLE`; rejecting returns machine to `UNDER_MAINTENANCE`.

---

## 5. Safety Incident Management APIs

### `GET /api/safety/incidents`
* **Access**: Authenticated
* **Description**: Retrieves workplace hazards and safety incident logs.

### `POST /api/safety/incidents`
* **Access**: Authenticated
* **Body**: `{ "incidentType": "HAZARD", "category": "Interlock Guarding", "severity": "HIGH", "description": "..." }`

### `POST /api/safety/incidents/:id/acknowledge`
* **Access**: Manager, Admin
* **Description**: Acknowledges and escalates safety hazard.

### `POST /api/safety/incidents/:id/resolve`
* **Access**: Manager, Admin
* **Body**: `{ "resolutionNotes": "Guard sensor re-aligned and tested." }`
* **Description**: Formally resolves safety incident.

---

## 6. Scenario Simulator APIs

### `POST /api/simulations`
* **Access**: Manager, Admin
* **Body**: `{ "scenarioType": "MACHINE_FAILURE", "name": "CNC-101 Stress Test", "parameters": { "machineId": "<id>", "downtimeHrs": 6 } }`
* **Description**: Computes hypothetical disruption metrics in non-destructive snapshot mode without altering live database records.

### `POST /api/simulations/:id/convert`
* **Access**: Manager, Admin
* **Description**: Converts simulation result into a live `recovery_plans` proposal in `PROPOSED` state.

---

## 7. Global Search & Analytics APIs

### `GET /api/global-search`
* **Access**: Authenticated
* **Params**: `q=<query>`
* **Description**: Instant search across Workers, Machines, Production Orders, Maintenance Requests, and Safety Incidents.

### `GET /api/analytics/actual-vs-target`
* **Access**: Manager, Admin
* **Description**: Actual vs Target performance metrics across production output, quality yield, machine utilization, workforce availability, and maintenance completion.
