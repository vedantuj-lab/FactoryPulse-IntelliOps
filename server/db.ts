import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'factorypulse.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return `${actualSalt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const hashBuffer = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  if (hashBuffer.length !== keyBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, keyBuffer);
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE CHECK(name IN ('ADMIN', 'MANAGER', 'WORKER', 'TECHNICIAN')),
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factories (
      id TEXT PRIMARY KEY,
      factory_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      operating_hours TEXT NOT NULL,
      alert_threshold_pct INTEGER NOT NULL DEFAULT 85,
      maint_reminder_days INTEGER NOT NULL DEFAULT 14,
      notification_prefs_json TEXT NOT NULL DEFAULT '{"faultAlerts":true,"shiftChanges":true,"safetyEscalation":true}',
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      factory_id TEXT NOT NULL REFERENCES factories(id),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      manager_id TEXT,
      target_efficiency_pct INTEGER NOT NULL DEFAULT 90,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      employee_code TEXT NOT NULL UNIQUE,
      role_id TEXT NOT NULL REFERENCES roles(id),
      department_id TEXT REFERENCES departments(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      phone TEXT,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      department_id TEXT NOT NULL REFERENCES departments(id),
      designation TEXT NOT NULL,
      experience_years INTEGER NOT NULL DEFAULT 2,
      availability TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(availability IN ('AVAILABLE', 'ASSIGNED', 'ABSENT', 'ON_LEAVE')),
      assigned_machine_id TEXT,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worker_skills (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id),
      skill_id TEXT NOT NULL REFERENCES skills(id),
      proficiency_level INTEGER NOT NULL DEFAULT 3 CHECK(proficiency_level BETWEEN 1 AND 5),
      UNIQUE(worker_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS certifications (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id),
      name TEXT NOT NULL,
      issuing_body TEXT NOT NULL,
      issued_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'VALID' CHECK(status IN ('VALID', 'EXPIRING_SOON', 'EXPIRED'))
    );

    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      factory_id TEXT NOT NULL REFERENCES factories(id),
      department_id TEXT NOT NULL REFERENCES departments(id),
      machine_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      machine_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IDLE' CHECK(status IN ('OPERATING', 'IDLE', 'FAULT', 'MAINTENANCE', 'UNDER_MAINTENANCE', 'VERIFICATION_REQUIRED', 'AWAITING_VERIFICATION', 'INACTIVE')),
      capacity_units_per_hr INTEGER NOT NULL,
      utilization_pct INTEGER NOT NULL DEFAULT 0,
      required_skill_code TEXT NOT NULL,
      required_cert_name TEXT,
      instructions TEXT NOT NULL,
      last_serviced_date TEXT NOT NULL,
      operating_hours_total INTEGER NOT NULL DEFAULT 1200,
      idle_hours_total INTEGER NOT NULL DEFAULT 180,
      fault_hours_total INTEGER NOT NULL DEFAULT 24,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      department_id TEXT NOT NULL REFERENCES departments(id),
      name TEXT NOT NULL CHECK(name IN ('Morning', 'Afternoon', 'Night')),
      shift_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      required_workers INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shift_assignments (
      id TEXT PRIMARY KEY,
      shift_id TEXT NOT NULL REFERENCES shifts(id),
      worker_id TEXT NOT NULL REFERENCES workers(id),
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      created_at TEXT NOT NULL,
      UNIQUE(shift_id, worker_id)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id),
      attendance_date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      hours_worked REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PRESENT' CHECK(status IN ('PRESENT', 'CHECKED_OUT', 'ABSENT', 'LATE')),
      UNIQUE(worker_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS production_orders (
      id TEXT PRIMARY KEY,
      order_code TEXT NOT NULL UNIQUE,
      factory_id TEXT NOT NULL REFERENCES factories(id),
      department_id TEXT NOT NULL REFERENCES departments(id),
      machine_id TEXT REFERENCES machines(id),
      product_name TEXT NOT NULL,
      target_qty INTEGER NOT NULL,
      produced_qty INTEGER NOT NULL DEFAULT 0,
      downtime_mins INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'IN_PROGRESS', 'DELAYED', 'COMPLETED', 'ON_HOLD')),
      deadline TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_tasks (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES production_orders(id),
      worker_id TEXT NOT NULL REFERENCES workers(id),
      machine_id TEXT NOT NULL REFERENCES machines(id),
      parent_task_id TEXT REFERENCES production_tasks(id),
      sequence_order INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      target_qty INTEGER NOT NULL,
      completed_qty INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'REASSIGNED')),
      deadline TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_logs (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES production_orders(id),
      recorded_by_id TEXT NOT NULL REFERENCES users(id),
      output_delta INTEGER NOT NULL,
      downtime_mins INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      log_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machine_assignments (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES machines(id),
      worker_id TEXT NOT NULL REFERENCES workers(id),
      order_id TEXT REFERENCES production_orders(id),
      active INTEGER NOT NULL DEFAULT 1,
      assigned_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machine_status_logs (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES machines(id),
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      changed_by_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS safety_incidents (
      id TEXT PRIMARY KEY,
      incident_code TEXT NOT NULL UNIQUE,
      department_id TEXT NOT NULL REFERENCES departments(id),
      reported_by_id TEXT NOT NULL REFERENCES users(id),
      incident_type TEXT NOT NULL CHECK(incident_type IN ('INCIDENT', 'HAZARD')),
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'ACTION_ASSIGNED', 'RESOLVED')),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS safety_actions (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES safety_incidents(id),
      assigned_to_id TEXT NOT NULL REFERENCES users(id),
      action_plan TEXT NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'COMPLETED')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id TEXT PRIMARY KEY,
      request_code TEXT NOT NULL UNIQUE,
      machine_id TEXT NOT NULL REFERENCES machines(id),
      reported_by_id TEXT NOT NULL REFERENCES users(id),
      assigned_tech_id TEXT REFERENCES users(id),
      fault_category TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      description TEXT NOT NULL,
      diagnosis TEXT,
      repair_notes TEXT,
      parts_used TEXT,
      status TEXT NOT NULL DEFAULT 'REPORTED' CHECK(status IN ('REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_APPROVAL', 'COMPLETED')),
      scheduled_date TEXT,
      downtime_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS maintenance_schedules (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES machines(id),
      technician_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      duration_hrs REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES maintenance_requests(id),
      actor_id TEXT NOT NULL REFERENCES users(id),
      status_from TEXT NOT NULL,
      status_to TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_id TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simulation_scenarios (
      id TEXT PRIMARY KEY,
      created_by_id TEXT NOT NULL REFERENCES users(id),
      scenario_type TEXT NOT NULL,
      name TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      assumptions TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simulation_results (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES simulation_scenarios(id),
      metrics_before_json TEXT NOT NULL,
      metrics_after_json TEXT NOT NULL,
      recommendations_json TEXT NOT NULL,
      estimated_delay_hrs REAL NOT NULL,
      converted_plan_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_plans (
      id TEXT PRIMARY KEY,
      plan_code TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      trigger_entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED', 'APPROVED', 'MODIFIED', 'REJECTED', 'STALE')),
      weights_json TEXT NOT NULL,
      before_metrics_json TEXT NOT NULL,
      after_metrics_json TEXT NOT NULL,
      approved_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS recovery_recommendations (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES recovery_plans(id),
      order_id TEXT,
      source_machine_id TEXT,
      target_machine_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      skill_score REAL NOT NULL,
      availability_score REAL NOT NULL,
      machine_compat_score REAL NOT NULL,
      priority_score REAL NOT NULL,
      efficiency_score REAL NOT NULL,
      total_normalized_score REAL NOT NULL,
      rationale TEXT NOT NULL,
      selected INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY,
      event_code TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      description TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED')),
      responsible_person_id TEXT REFERENCES users(id),
      acknowledged_by_id TEXT REFERENCES users(id),
      acknowledged_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bottleneck_analysis (
      id TEXT PRIMARY KEY,
      department_id TEXT NOT NULL REFERENCES departments(id),
      order_id TEXT REFERENCES production_orders(id),
      category TEXT NOT NULL CHECK(category IN ('WORKFORCE_SHORTAGE', 'MACHINE_CAPACITY_SHORTAGE', 'MACHINE_DOWNTIME', 'UNBALANCED_ALLOCATION', 'SHIFT_STAFFING_SHORTAGE', 'SCHEDULING_CONFLICT')),
      severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      required_capacity REAL NOT NULL,
      available_capacity REAL NOT NULL,
      capacity_gap REAL NOT NULL,
      supporting_data_json TEXT NOT NULL,
      operational_impact TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'POTENTIAL', 'MITIGATED')),
      detected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shift_handovers (
      id TEXT PRIMARY KEY,
      handover_code TEXT NOT NULL UNIQUE,
      factory_id TEXT NOT NULL REFERENCES factories(id),
      department_id TEXT NOT NULL REFERENCES departments(id),
      outgoing_shift_id TEXT NOT NULL REFERENCES shifts(id),
      incoming_shift_id TEXT NOT NULL REFERENCES shifts(id),
      submitted_by_id TEXT NOT NULL REFERENCES users(id),
      acknowledged_by_id TEXT REFERENCES users(id),
      handover_date TEXT NOT NULL,
      pending_tasks_json TEXT NOT NULL,
      machine_faults_json TEXT NOT NULL,
      maintenance_status_json TEXT NOT NULL,
      safety_incidents_json TEXT NOT NULL,
      operational_notes TEXT NOT NULL,
      follow_up_user_id TEXT REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED')),
      created_at TEXT NOT NULL,
      acknowledged_at TEXT
    );

    CREATE TABLE IF NOT EXISTS quality_inspections (
      id TEXT PRIMARY KEY,
      inspection_code TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL REFERENCES production_orders(id),
      task_id TEXT REFERENCES production_tasks(id),
      inspector_id TEXT NOT NULL REFERENCES users(id),
      inspected_qty INTEGER NOT NULL,
      accepted_qty INTEGER NOT NULL,
      rejected_qty INTEGER NOT NULL,
      quality_rate REAL NOT NULL,
      rejection_category TEXT DEFAULT 'NONE',
      notes TEXT,
      inspection_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CHECK(accepted_qty + rejected_qty = inspected_qty)
    );

    CREATE TABLE IF NOT EXISTS escalation_rules (
      id TEXT PRIMARY KEY,
      priority TEXT NOT NULL UNIQUE CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      deadline_minutes INTEGER NOT NULL,
      escalation_role TEXT NOT NULL DEFAULT 'MANAGER',
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS escalation_history (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('MAINTENANCE_REQUEST', 'SAFETY_INCIDENT', 'PRODUCTION_ORDER', 'CORRECTIVE_ACTION')),
      entity_id TEXT NOT NULL,
      priority TEXT NOT NULL,
      deadline_at TEXT NOT NULL,
      escalated_at TEXT NOT NULL,
      escalated_to_id TEXT REFERENCES users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'RESOLVED'))
    );

    CREATE TABLE IF NOT EXISTS scenario_comparisons (
      id TEXT PRIMARY KEY,
      comparison_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      created_by_id TEXT NOT NULL REFERENCES users(id),
      scenarios_json TEXT NOT NULL,
      selected_scenario_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_import_jobs (
      id TEXT PRIMARY KEY,
      imported_by_id TEXT NOT NULL REFERENCES users(id),
      entity_type TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      valid_rows INTEGER NOT NULL,
      error_rows INTEGER NOT NULL,
      summary_notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
    CREATE INDEX IF NOT EXISTS idx_workers_dept ON workers(department_id);
    CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON production_orders(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_operational_events_created ON operational_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_handovers_dept ON shift_handovers(department_id, handover_date);
    CREATE INDEX IF NOT EXISTS idx_quality_order ON quality_inspections(order_id);
  `);

  // Seed default escalation rules if missing
  const countRules = db.prepare('SELECT COUNT(*) as c FROM escalation_rules').get() as { c: number };
  if (countRules.c === 0) {
    const now = new Date().toISOString();
    const insRule = db.prepare(`
      INSERT INTO escalation_rules (id, priority, deadline_minutes, escalation_role, is_active, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    insRule.run(uuid(), 'CRITICAL', 30, 'MANAGER', now);
    insRule.run(uuid(), 'HIGH', 120, 'MANAGER', now);
    insRule.run(uuid(), 'MEDIUM', 240, 'MANAGER', now);
    insRule.run(uuid(), 'LOW', 480, 'MANAGER', now);
  }
}

export function createAuditLog(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  description: string
): void {
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), userId, action, entityType, entityId, description, new Date().toISOString());
}

export function createNotification(
  userId: string,
  category: string,
  title: string,
  message: string,
  relatedLink?: string
): void {
  db.prepare(`
    INSERT INTO notifications (id, user_id, category, title, message, related_link, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(uuid(), userId, category, title, message, relatedLink || null, new Date().toISOString());
}

export function notifyRole(
  roleName: 'ADMIN' | 'MANAGER' | 'WORKER' | 'TECHNICIAN',
  category: string,
  title: string,
  message: string,
  relatedLink?: string
): void {
  const users = db.prepare(`
    SELECT u.id FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE r.name = ? AND u.is_active = 1
  `).all(roleName) as { id: string }[];

  for (const u of users) {
    createNotification(u.id, category, title, message, relatedLink);
  }
}

export function createOperationalEvent(params: {
  eventType: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  entityType: string;
  entityId?: string | null;
  responsiblePersonId?: string | null;
}): string {
  const id = uuid();
  const eventCode = `EVT-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO operational_events (id, event_code, event_type, priority, description, entity_type, entity_id, status, responsible_person_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(
    id,
    eventCode,
    params.eventType,
    params.priority,
    params.description,
    params.entityType,
    params.entityId || null,
    params.responsiblePersonId || null,
    new Date().toISOString()
  );
  return id;
}

export function evaluateMandatoryAlerts(): void {
  const now = new Date().toISOString();
  const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000).toISOString();

  // Helper to insert alert if no recent duplicate exists
  const pushAlert = (severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', category: string, title: string, message: string, entityId: string) => {
    const existing = db.prepare(`
      SELECT id FROM alerts WHERE category = ? AND entity_id = ? AND created_at > ?
    `).get(category, entityId, twelveHoursAgo);
    if (!existing) {
      db.prepare(`
        INSERT INTO alerts (id, severity, category, title, message, entity_id, acknowledged, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).run(uuid(), severity, category, title, message, entityId, now);
    }
  };

  // 1. PRODUCTION_BELOW_TARGET
  const delayedOrders = db.prepare(`
    SELECT id, order_code, product_name, target_qty, produced_qty, deadline
    FROM production_orders
    WHERE status IN ('DELAYED', 'IN_PROGRESS') AND (produced_qty < target_qty * 0.7)
  `).all() as any[];
  for (const o of delayedOrders) {
    pushAlert(
      'HIGH',
      'PRODUCTION_BELOW_TARGET',
      `Production Output Below Target: ${o.order_code}`,
      `Order ${o.order_code} (${o.product_name}) produced ${o.produced_qty}/${o.target_qty} units with deadline ${o.deadline}.`,
      o.id
    );
  }

  // 2. EXCESSIVE_MACHINE_DOWNTIME
  const faultedMachines = db.prepare(`
    SELECT id, machine_code, name, fault_hours_total FROM machines
    WHERE status IN ('FAULT', 'MAINTENANCE', 'UNDER_MAINTENANCE') OR fault_hours_total >= 10
  `).all() as any[];
  for (const m of faultedMachines) {
    pushAlert(
      'CRITICAL',
      'EXCESSIVE_MACHINE_DOWNTIME',
      `Excessive Downtime Alert: ${m.machine_code}`,
      `Machine ${m.machine_code} (${m.name}) cumulative downtime exceeds operational threshold.`,
      m.id
    );
  }

  // 3. WORKER_SHORTAGE
  const understaffedShifts = db.prepare(`
    SELECT s.id, s.name, s.shift_date, s.required_workers, d.name as department_name,
           (SELECT COUNT(*) FROM shift_assignments sa WHERE sa.shift_id = s.id) as assigned_count
    FROM shifts s JOIN departments d ON s.department_id = d.id
    WHERE (SELECT COUNT(*) FROM shift_assignments sa WHERE sa.shift_id = s.id) < s.required_workers
  `).all() as any[];
  for (const s of understaffedShifts) {
    pushAlert(
      'MEDIUM',
      'WORKER_SHORTAGE',
      `Shift Staffing Deficit: ${s.department_name} ${s.name}`,
      `Shift on ${s.shift_date} has ${s.assigned_count}/${s.required_workers} workers assigned.`,
      s.id
    );
  }

  // 4. UPCOMING_MAINTENANCE
  const overdueMaint = db.prepare(`
    SELECT ms.id, ms.title, m.machine_code FROM maintenance_schedules ms
    JOIN machines m ON ms.machine_id = m.id WHERE ms.status = 'OVERDUE'
  `).all() as any[];
  for (const ms of overdueMaint) {
    pushAlert(
      'HIGH',
      'UPCOMING_MAINTENANCE',
      `Preventive Maintenance Overdue: ${ms.machine_code}`,
      `Service '${ms.title}' on ${ms.machine_code} is overdue.`,
      ms.id
    );
  }

  // 5. SAFETY_INCIDENTS
  const openSafety = db.prepare(`
    SELECT id, incident_code, category, severity FROM safety_incidents
    WHERE status != 'RESOLVED' AND severity IN ('HIGH', 'CRITICAL')
  `).all() as any[];
  for (const si of openSafety) {
    pushAlert(
      si.severity as 'HIGH' | 'CRITICAL',
      'SAFETY_INCIDENT',
      `Unresolved Safety Hazard: ${si.incident_code}`,
      `Critical hazard ${si.incident_code} (${si.category}) is awaiting resolution.`,
      si.id
    );
  }
}
