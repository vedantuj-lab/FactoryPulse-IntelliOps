import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import path from 'path';
import {
  db,
  uuid,
  hashPassword,
  verifyPassword,
  createAuditLog,
  createNotification,
  notifyRole,
  createOperationalEvent,
} from './server/db.js';
import { seedIfEmpty, getDemoSeedPassword } from './server/seed.js';
import {
  analyzeDisruptionAndRecommend,
  captureCurrentMetrics,
  DEFAULT_WEIGHTS,
} from './server/recoveryEngine.js';

seedIfEmpty();

const app = express();
app.use(express.json({ limit: '2mb' }));

// Simple in-memory rate limiter for sensitive auth endpoints
const authRateMap = new Map<string, { count: number; resetAt: number }>();
function rateLimitAuth(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'local';
  const now = Date.now();
  const entry = authRateMap.get(ip);
  if (!entry || entry.resetAt < now) {
    authRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 40) {
    return res.status(429).json({ error: 'Too many authentication attempts. Please wait 60 seconds.' });
  }
  return next();
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  employeeCode: string;
  role: 'ADMIN' | 'MANAGER' | 'WORKER' | 'TECHNICIAN';
  departmentId: string | null;
  departmentName: string | null;
  phone: string | null;
  workerId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionToken?: string;
    }
  }
}

function getUserByToken(token: string | undefined): AuthenticatedUser | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.expires_at, u.id, u.email, u.full_name, u.employee_code, u.department_id, u.phone, u.is_active,
           r.name as role_name, d.name as department_name, w.id as worker_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN workers w ON w.user_id = u.id
    WHERE s.token = ?
  `).get(token) as any;

  if (!row || !row.is_active) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    employeeCode: row.employee_code,
    role: row.role_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    phone: row.phone,
    workerId: row.worker_id || null,
  };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const user = getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Session expired or unauthenticated. Please sign in.' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

function requireRoles(...allowed: ('ADMIN' | 'MANAGER' | 'WORKER' | 'TECHNICIAN')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied: Your authenticated role (${req.user.role}) is not authorized for this resource.`,
      });
    }
    next();
  };
}

// ============================================================================
// PUBLIC LANDING TELEMETRY (Read-only aggregated DB metrics for Landing Page)
// ============================================================================
app.get('/api/public/pulse-summary', (_req, res) => {
  const activeWorkforce = (db.prepare(`SELECT COUNT(*) as c FROM workers WHERE availability != 'ABSENT'`).get() as any).c;
  const totalWorkforce = (db.prepare(`SELECT COUNT(*) as c FROM workers`).get() as any).c;
  const operatingMachines = (db.prepare(`SELECT COUNT(*) as c FROM machines WHERE status = 'OPERATING'`).get() as any).c;
  const totalMachines = (db.prepare(`SELECT COUNT(*) as c FROM machines`).get() as any).c;
  const orders = db.prepare(`SELECT SUM(target_qty) as tgt, SUM(produced_qty) as prod FROM production_orders`).get() as any;
  const pendingMaint = (db.prepare(`SELECT COUNT(*) as c FROM maintenance_requests WHERE status != 'COMPLETED'`).get() as any).c;
  const factory = db.prepare(`SELECT name, factory_code, location, is_demo FROM factories LIMIT 1`).get() as any;

  const achievement = orders?.tgt ? Math.round((orders.prod / orders.tgt) * 100) : 0;

  res.json({
    isDemonstrationDataset: Boolean(factory?.is_demo),
    factoryName: factory?.name || 'Northstar Manufacturing Works',
    factoryCode: factory?.factory_code || 'FAC-NMW-01',
    activeWorkforce,
    totalWorkforce,
    operatingMachines,
    totalMachines,
    productionAchievementPct: achievement,
    pendingMaintenance: pendingMaint,
    demoPasswordHint: getDemoSeedPassword(),
  });
});

// ============================================================================
// 1. AUTHENTICATION & PROFILE
// ============================================================================
app.post('/api/auth/login', rateLimitAuth, (req, res) => {
  const { email, password, selectedRole, rememberMe } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const row = db.prepare(`
    SELECT u.*, r.name as role_name, d.name as department_name, w.id as worker_id
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN workers w ON w.user_id = u.id
    WHERE LOWER(u.email) = ?
  `).get(normalizedEmail) as any;

  if (!row || !verifyPassword(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password credentials. Please check your credentials.' });
  }

  if (!row.is_active) {
    return res.status(403).json({ error: 'This user account has been deactivated by an Administrator.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const ttlHours = rememberMe ? 24 * 7 : 12;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, row.id, expiresAt, new Date().toISOString());

  createAuditLog(row.id, 'USER_LOGIN', 'USER', row.id, `${row.full_name} (${row.role_name}) authenticated successfully`);

  const redirectMap: Record<string, string> = {
    ADMIN: '/admin/dashboard',
    MANAGER: '/manager/dashboard',
    WORKER: '/worker/dashboard',
    TECHNICIAN: '/technician/dashboard',
  };

  res.json({
    token,
    expiresAt,
    redirectTo: redirectMap[row.role_name],
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      employeeCode: row.employee_code,
      role: row.role_name,
      departmentId: row.department_id,
      departmentName: row.department_name,
      phone: row.phone,
      workerId: row.worker_id || null,
    },
  });
});

// GOOGLE OAUTH AUTHENTICATION ROUTE
app.post('/api/auth/google', rateLimitAuth, (req, res) => {
  const { googleEmail, googleName, roleHint, rememberMe } = req.body || {};
  if (!googleEmail || !String(googleEmail).includes('@')) {
    return res.status(400).json({ error: 'Valid Google email is required for OAuth authentication.' });
  }

  const normalizedEmail = String(googleEmail).trim().toLowerCase();
  let row = db.prepare(`
    SELECT u.*, r.name as role_name, d.name as department_name, w.id as worker_id
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN workers w ON w.user_id = u.id
    WHERE LOWER(u.email) = ?
  `).get(normalizedEmail) as any;

  // If new Google account, provision account automatically based on roleHint
  if (!row) {
    const targetRoleName = String(roleHint || 'WORKER').toUpperCase();
    const roleRecord = db.prepare('SELECT id, name FROM roles WHERE name = ?').get(targetRoleName) as any || db.prepare("SELECT id, name FROM roles WHERE name = 'WORKER'").get() as any;
    const deptRecord = db.prepare('SELECT id FROM departments LIMIT 1').get() as any;

    const newUserId = uuid();
    const empCode = `EMP-GGL-${Date.now().toString().slice(-4)}`;
    const fullName = googleName || normalizedEmail.split('@')[0].replace(/[._]/g, ' ');
    const dummyHash = hashPassword(`GoogleOAuth!${Date.now()}`);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, employee_code, role_id, department_id, is_active, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
    `).run(newUserId, normalizedEmail, dummyHash, fullName, empCode, roleRecord.id, deptRecord?.id || null, now, now);

    if (roleRecord.name === 'WORKER') {
      db.prepare(`
        INSERT INTO workers (id, user_id, department_id, designation, experience_years, availability, is_demo, created_at)
        VALUES (?, ?, ?, 'Line Operator (Google OAuth)', 2, 'AVAILABLE', 1, ?)
      `).run(uuid(), newUserId, deptRecord?.id || null, now);
    }

    row = db.prepare(`
      SELECT u.*, r.name as role_name, d.name as department_name, w.id as worker_id
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN workers w ON w.user_id = u.id
      WHERE u.id = ?
    `).get(newUserId) as any;
  }

  if (!row.is_active) {
    return res.status(403).json({ error: 'This Google account has been deactivated by an Administrator.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const ttlHours = rememberMe ? 24 * 7 : 12;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, row.id, expiresAt, new Date().toISOString());

  createAuditLog(row.id, 'GOOGLE_AUTH_LOGIN', 'USER', row.id, `${row.full_name} (${row.role_name}) signed in via Google OAuth (${row.email})`);

  const redirectMap: Record<string, string> = {
    ADMIN: '/admin/dashboard',
    MANAGER: '/manager/dashboard',
    WORKER: '/worker/dashboard',
    TECHNICIAN: '/technician/dashboard',
  };

  res.json({
    token,
    expiresAt,
    redirectTo: redirectMap[row.role_name],
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      employeeCode: row.employee_code,
      role: row.role_name,
      departmentId: row.department_id,
      departmentName: row.department_name,
      phone: row.phone,
      workerId: row.worker_id || null,
    },
  });
});

// CONVERSATIONAL ASSISTANT ROUTE (/api/assistant/chat)
app.post('/api/assistant/chat', requireAuth, (req, res) => {
  const { message = '', language = 'en' } = req.body || {};
  const msg = String(message).trim().toLowerCase();
  const role = req.user!.role;

  let reply = '';
  let actionLink: string | undefined = undefined;
  let actionLabel: string | undefined = undefined;

  if (msg.includes('hi') || msg.includes('hello') || msg.includes('good morning') || msg.includes('namaste')) {
    reply = `Hello ${req.user!.fullName}! Welcome to FactoryPulse IntelliOps. How can I assist you with factory operations today?`;
  } else if (msg.includes('fault') || msg.includes('broken') || msg.includes('machine fault')) {
    const faultCount = (db.prepare(`SELECT COUNT(*) as c FROM machines WHERE status IN ('FAULT', 'MAINTENANCE', 'VERIFICATION_REQUIRED')`).get() as any).c;
    const machines = db.prepare(`SELECT machine_code, name, status FROM machines WHERE status IN ('FAULT', 'MAINTENANCE', 'VERIFICATION_REQUIRED') LIMIT 3`).all() as any[];
    if (faultCount > 0) {
      reply = `There are currently ${faultCount} machine(s) in fault/maintenance state: ${machines.map(m => `${m.machine_code} (${m.name} - ${m.status})`).join(', ')}.`;
      actionLink = role === 'TECHNICIAN' ? '/technician/dashboard' : '/manager/dashboard?tab=machines';
      actionLabel = 'View Machines';
    } else {
      reply = 'All plant machine bays are currently operating in nominal state with zero active faults.';
    }
  } else if (msg.includes('delay') || msg.includes('production delay') || msg.includes('order')) {
    const delayed = db.prepare(`SELECT order_code, product_name, target_qty, produced_qty FROM production_orders WHERE status = 'DELAYED' LIMIT 2`).all() as any[];
    if (delayed.length > 0) {
      reply = `Active delayed orders detected: ${delayed.map(d => `${d.order_code} (${d.product_name}: ${d.produced_qty}/${d.target_qty} units)`).join(', ')}. The Recovery Engine can calculate minimal-change rerouting.`;
      actionLink = '/manager/recovery-engine';
      actionLabel = 'Open Recovery Engine';
    } else {
      reply = 'Production delivery schedules are on track with zero delayed orders recorded.';
    }
  } else if (msg.includes('worker') || msg.includes('shift') || msg.includes('headcount')) {
    const activeWrk = (db.prepare(`SELECT COUNT(*) as c FROM workers WHERE availability = 'AVAILABLE' OR availability = 'ASSIGNED'`).get() as any).c;
    reply = `Plant workforce active: ${activeWrk} workers currently available or assigned on shift.`;
    actionLink = role === 'ADMIN' ? '/admin/dashboard' : '/manager/dashboard';
    actionLabel = 'View Workforce';
  } else if (msg.includes('safety') || msg.includes('hazard')) {
    const hazards = db.prepare(`SELECT incident_code, category, severity FROM safety_incidents WHERE status != 'RESOLVED' LIMIT 2`).all() as any[];
    if (hazards.length > 0) {
      reply = `Active safety hazards logged: ${hazards.map(h => `${h.incident_code} (${h.category} - ${h.severity})`).join(', ')}.`;
      actionLink = role === 'WORKER' ? '/worker/dashboard' : '/manager/dashboard';
      actionLabel = 'View Safety';
    } else {
      reply = 'Zero open critical safety hazards. Workplace safety compliance is verified.';
    }
  } else if (msg.includes('recovery') || msg.includes('recommendation')) {
    reply = 'The Intelligent Recovery Engine evaluates hard eligibility constraints (skills, valid certs, shift availability, machine capacity) before scoring options on a 0-100 scale.';
    actionLink = '/manager/recovery-engine';
    actionLabel = 'Open Recovery Engine';
  } else {
    reply = `I have logged your operational query: "${message}". You may inspect current plant health, production orders, and recovery proposals directly from your authorized portal.`;
  }

  res.json({ reply, actionLink, actionLabel });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  if (req.sessionToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  }
  if (req.user) {
    createAuditLog(req.user.id, 'USER_LOGOUT', 'USER', req.user.id, `${req.user.fullName} signed out`);
  }
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/forgot-password', rateLimitAuth, (req, res) => {
  const { email, newPassword } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Please provide your registered work email.' });
  }
  const user = db.prepare('SELECT id, full_name, is_demo FROM users WHERE LOWER(email) = ?').get(String(email).trim().toLowerCase()) as any;
  if (!user) {
    return res.status(404).json({ error: 'No active FactoryPulse account found with that email address.' });
  }

  // Controlled password reset workflow
  if (newPassword && String(newPassword).length >= 8) {
    const newHash = hashPassword(String(newPassword));
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, new Date().toISOString(), user.id);
    createAuditLog(user.id, 'PASSWORD_RESET', 'USER', user.id, `Password reset completed via recovery workflow`);
    return res.json({ message: 'Password updated successfully. You may now sign in with your new password.' });
  }

  res.json({
    message: 'Account verified. Enter a new password (min 8 characters) to complete secure credential reset.',
    verified: true,
  });
});

app.patch('/api/auth/profile', requireAuth, (req, res) => {
  const { fullName, phone, newPassword } = req.body || {};
  const u = req.user!;
  const now = new Date().toISOString();

  if (fullName && String(fullName).trim().length >= 2) {
    db.prepare('UPDATE users SET full_name = ?, phone = ?, updated_at = ? WHERE id = ?').run(
      String(fullName).trim(),
      phone ? String(phone).trim() : u.phone,
      now,
      u.id
    );
  } else if (phone !== undefined) {
    db.prepare('UPDATE users SET phone = ?, updated_at = ? WHERE id = ?').run(String(phone).trim(), now, u.id);
  }

  if (newPassword && String(newPassword).length >= 8) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(String(newPassword)), now, u.id);
  }

  createAuditLog(u.id, 'PROFILE_UPDATED', 'USER', u.id, `Updated personal profile settings`);
  const updated = getUserByToken(req.sessionToken);
  res.json({ user: updated, message: 'Profile settings saved.' });
});

// ============================================================================
// 2. ADMINISTRATION APIs (/api/admin/*)
// ============================================================================
app.get('/api/admin/overview', requireAuth, requireRoles('ADMIN'), (_req, res) => {
  const totalFactories = (db.prepare('SELECT COUNT(*) as c FROM factories').get() as any).c;
  const totalDepartments = (db.prepare('SELECT COUNT(*) as c FROM departments').get() as any).c;
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  const activeAccounts = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get() as any).c;
  const roleCounts = db.prepare(`
    SELECT r.name, COUNT(u.id) as count
    FROM roles r
    LEFT JOIN users u ON u.role_id = r.id
    GROUP BY r.name
  `).all() as { name: string; count: number }[];

  const registeredMachines = (db.prepare('SELECT COUNT(*) as c FROM machines').get() as any).c;

  const deptDistribution = db.prepare(`
    SELECT d.name,
           (SELECT COUNT(*) FROM workers w WHERE w.department_id = d.id) as workers,
           (SELECT COUNT(*) FROM machines m WHERE m.department_id = d.id) as machines,
           d.target_efficiency_pct as targetEfficiency
    FROM departments d
    ORDER BY d.name
  `).all();

  const machineStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM machines GROUP BY status
  `).all();

  const recentAudits = db.prepare(`
    SELECT a.*, u.full_name as user_name, u.employee_code, r.name as role_name
    FROM audit_logs a
    JOIN users u ON a.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    ORDER BY a.created_at DESC
    LIMIT 25
  `).all();

  const skills = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM worker_skills ws WHERE ws.skill_id = s.id) as qualified_workers
    FROM skills s
    ORDER BY s.category, s.name
  `).all();

  const certifications = db.prepare(`
    SELECT c.*, u.full_name as worker_name, u.employee_code
    FROM certifications c
    JOIN workers w ON c.worker_id = w.id
    JOIN users u ON w.user_id = u.id
    ORDER BY c.expiry_date ASC
  `).all();

  res.json({
    kpis: {
      totalFactories,
      totalDepartments,
      totalUsers,
      activeAccounts,
      totalWorkers: roleCounts.find((r) => r.name === 'WORKER')?.count || 0,
      totalManagers: roleCounts.find((r) => r.name === 'MANAGER')?.count || 0,
      totalTechnicians: roleCounts.find((r) => r.name === 'TECHNICIAN')?.count || 0,
      registeredMachines,
    },
    roleCounts,
    deptDistribution,
    machineStats,
    recentAudits,
    skills,
    certifications,
  });
});

app.get('/api/admin/factories', requireAuth, requireRoles('ADMIN', 'MANAGER'), (_req, res) => {
  const factories = db.prepare(`
    SELECT f.*,
           (SELECT COUNT(*) FROM departments d WHERE d.factory_id = f.id) as department_count,
           (SELECT COUNT(*) FROM machines m WHERE m.factory_id = f.id) as machine_count
    FROM factories f
    ORDER BY f.created_at ASC
  `).all();
  res.json({ factories });
});

app.post('/api/admin/factories', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { name, factoryCode, location, contactEmail, contactPhone, operatingHours } = req.body || {};
  if (!name || !factoryCode || !location) {
    return res.status(400).json({ error: 'Factory name, code, and location are required.' });
  }
  const id = uuid();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO factories (id, factory_code, name, location, contact_email, contact_phone, operating_hours, alert_threshold_pct, maint_reminder_days, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 85, 14, 0, ?, ?)
    `).run(
      id,
      String(factoryCode).trim().toUpperCase(),
      String(name).trim(),
      String(location).trim(),
      contactEmail || 'ops@factorypulse.demo',
      contactPhone || '+91 20 6700 0000',
      operatingHours || '24x6 Three-Shift Continuous',
      now,
      now
    );
    createAuditLog(req.user!.id, 'FACTORY_CREATED', 'FACTORY', id, `Registered factory ${name} (${factoryCode})`);
    res.status(201).json({ id, message: 'Factory registered successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not register factory (duplicate code).' });
  }
});

app.patch('/api/admin/factories/:id', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { id } = req.params;
  const { name, location, contactEmail, contactPhone, operatingHours, alertThresholdPct, maintReminderDays, notificationPrefs } = req.body || {};
  const existing = db.prepare('SELECT * FROM factories WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Factory not found.' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE factories
    SET name = ?, location = ?, contact_email = ?, contact_phone = ?, operating_hours = ?,
        alert_threshold_pct = ?, maint_reminder_days = ?, notification_prefs_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name ?? existing.name,
    location ?? existing.location,
    contactEmail ?? existing.contact_email,
    contactPhone ?? existing.contact_phone,
    operatingHours ?? existing.operating_hours,
    alertThresholdPct !== undefined ? Number(alertThresholdPct) : existing.alert_threshold_pct,
    maintReminderDays !== undefined ? Number(maintReminderDays) : existing.maint_reminder_days,
    notificationPrefs ? JSON.stringify(notificationPrefs) : existing.notification_prefs_json,
    now,
    id
  );

  createAuditLog(req.user!.id, 'FACTORY_CONFIG_UPDATED', 'FACTORY', id, `Updated configuration and thresholds for ${name || existing.name}`);
  res.json({ message: 'Factory configuration updated.' });
});

app.get('/api/admin/departments', requireAuth, (_req, res) => {
  const departments = db.prepare(`
    SELECT d.*, f.name as factory_name, u.full_name as manager_name,
           (SELECT COUNT(*) FROM workers w WHERE w.department_id = d.id) as worker_count,
           (SELECT COUNT(*) FROM machines m WHERE m.department_id = d.id) as machine_count
    FROM departments d
    JOIN factories f ON d.factory_id = f.id
    LEFT JOIN users u ON d.manager_id = u.id
    ORDER BY d.name ASC
  `).all();
  res.json({ departments });
});

app.post('/api/admin/departments', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { factoryId, code, name, managerId, targetEfficiencyPct } = req.body || {};
  if (!factoryId || !code || !name) {
    return res.status(400).json({ error: 'Factory, department code, and name are required.' });
  }
  const id = uuid();
  try {
    db.prepare(`
      INSERT INTO departments (id, factory_id, code, name, manager_id, target_efficiency_pct, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, factoryId, String(code).trim().toUpperCase(), String(name).trim(), managerId || null, Number(targetEfficiencyPct || 90), new Date().toISOString());
    createAuditLog(req.user!.id, 'DEPARTMENT_CREATED', 'DEPARTMENT', id, `Created department ${name} (${code})`);
    res.status(201).json({ id, message: 'Department created.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Department code already exists.' });
  }
});

app.patch('/api/admin/departments/:id', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { id } = req.params;
  const { name, managerId, targetEfficiencyPct } = req.body || {};
  const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Department not found.' });

  db.prepare(`
    UPDATE departments SET name = ?, manager_id = ?, target_efficiency_pct = ? WHERE id = ?
  `).run(
    name ?? existing.name,
    managerId !== undefined ? managerId || null : existing.manager_id,
    targetEfficiencyPct !== undefined ? Number(targetEfficiencyPct) : existing.target_efficiency_pct,
    id
  );
  createAuditLog(req.user!.id, 'DEPARTMENT_UPDATED', 'DEPARTMENT', id, `Updated department ${name || existing.name}`);
  res.json({ message: 'Department updated.' });
});

app.get('/api/admin/users', requireAuth, requireRoles('ADMIN', 'MANAGER'), (req, res) => {
  const { search = '', role = '', status = '' } = req.query as Record<string, string>;
  let sql = `
    SELECT u.id, u.email, u.full_name, u.employee_code, u.department_id, u.is_active, u.phone, u.is_demo, u.created_at,
           r.name as role, d.name as department_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (search) {
    sql += ` AND (LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.employee_code) LIKE ?)`;
    const term = `%${search.toLowerCase()}%`;
    params.push(term, term, term);
  }
  if (role) {
    sql += ` AND r.name = ?`;
    params.push(role.toUpperCase());
  }
  if (status === 'active') sql += ` AND u.is_active = 1`;
  if (status === 'inactive') sql += ` AND u.is_active = 0`;

  sql += ` ORDER BY u.created_at DESC`;
  const users = db.prepare(sql).all(...params);
  res.json({ users });
});

app.post('/api/admin/users', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { email, fullName, employeeCode, role, departmentId, phone, password, designation } = req.body || {};
  if (!email || !fullName || !employeeCode || !role) {
    return res.status(400).json({ error: 'Name, email, employee code, and role are required.' });
  }
  const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(String(role).toUpperCase()) as any;
  if (!roleRow) return res.status(400).json({ error: 'Invalid role specified.' });

  const userId = uuid();
  const now = new Date().toISOString();
  const passHash = hashPassword(password && String(password).length >= 8 ? String(password) : getDemoSeedPassword());

  try {
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, employee_code, role_id, department_id, is_active, phone, is_demo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?)
      `).run(
        userId,
        String(email).trim().toLowerCase(),
        passHash,
        String(fullName).trim(),
        String(employeeCode).trim().toUpperCase(),
        roleRow.id,
        departmentId || null,
        phone || null,
        now,
        now
      );

      if (String(role).toUpperCase() === 'WORKER') {
        const fallbackDept = departmentId || (db.prepare('SELECT id FROM departments LIMIT 1').get() as any).id;
        db.prepare(`
          INSERT INTO workers (id, user_id, department_id, designation, experience_years, availability, assigned_machine_id, is_demo, created_at)
          VALUES (?, ?, ?, ?, 1, 'AVAILABLE', NULL, 0, ?)
        `).run(uuid(), userId, fallbackDept, designation || 'Production Line Operator', now);
      }
    });
    tx();
    createAuditLog(req.user!.id, 'USER_CREATED', 'USER', userId, `Created ${role} account for ${fullName} (${email})`);
    createNotification(userId, 'SYSTEM', 'Welcome to FactoryPulse IntelliOps', `Your ${role} account (${employeeCode}) is now active.`);
    res.status(201).json({ id: userId, message: 'User account provisioned successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Email or Employee ID already exists.' });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { id } = req.params;
  const { fullName, role, departmentId, isActive, phone, resetPassword } = req.body || {};
  const existing = db.prepare(`
    SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?
  `).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  let roleId = existing.role_id;
  if (role && String(role).toUpperCase() !== existing.role_name) {
    const rRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(String(role).toUpperCase()) as any;
    if (rRow) {
      roleId = rRow.id;
      createAuditLog(req.user!.id, 'ROLE_CHANGED', 'USER', id, `Changed role for ${existing.full_name} from ${existing.role_name} to ${role}`);
    }
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET full_name = ?, role_id = ?, department_id = ?, is_active = ?, phone = ?, updated_at = ?
    WHERE id = ?
  `).run(
    fullName ?? existing.full_name,
    roleId,
    departmentId !== undefined ? departmentId : existing.department_id,
    isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
    phone !== undefined ? phone : existing.phone,
    now,
    id
  );

  if (resetPassword && String(resetPassword).length >= 8) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(resetPassword)), id);
    createAuditLog(req.user!.id, 'ADMIN_PASSWORD_RESET', 'USER', id, `Reset credentials for ${existing.full_name}`);
  } else {
    createAuditLog(req.user!.id, 'USER_UPDATED', 'USER', id, `Updated account status/details for ${existing.full_name}`);
  }

  res.json({ message: 'User account updated.' });
});

app.post('/api/admin/skills', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { code, name, category, description } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'Skill code and name are required.' });
  const id = uuid();
  try {
    db.prepare('INSERT INTO skills (id, code, name, category, description) VALUES (?, ?, ?, ?, ?)').run(
      id,
      String(code).trim().toUpperCase(),
      String(name).trim(),
      category || 'Operations',
      description || 'Verified industrial operational skill'
    );
    createAuditLog(req.user!.id, 'SKILL_CREATED', 'SKILL', id, `Registered skill ${code} (${name})`);
    res.status(201).json({ id, message: 'Skill added to catalog.' });
  } catch (err: any) {
    res.status(400).json({ error: 'Skill code already exists.' });
  }
});

app.post('/api/admin/certifications', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { workerId, name, issuingBody, issuedDate, expiryDate, skillId, proficiencyLevel } = req.body || {};
  if (!workerId || !name) return res.status(400).json({ error: 'Worker and certification name are required.' });
  const id = uuid();
  db.prepare(`
    INSERT INTO certifications (id, worker_id, name, issuing_body, issued_date, expiry_date, status)
    VALUES (?, ?, ?, ?, ?, ?, 'VALID')
  `).run(
    id,
    workerId,
    String(name).trim(),
    issuingBody || 'Industrial Safety Board',
    issuedDate || new Date().toISOString().slice(0, 10),
    expiryDate || '2028-01-01'
  );

  if (skillId) {
    db.prepare(`
      INSERT INTO worker_skills (id, worker_id, skill_id, proficiency_level)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(worker_id, skill_id) DO UPDATE SET proficiency_level = excluded.proficiency_level
    `).run(uuid(), workerId, skillId, Number(proficiencyLevel || 4));
  }

  createAuditLog(req.user!.id, 'CERTIFICATION_GRANTED', 'WORKER', workerId, `Issued certification "${name}" to worker`);
  res.status(201).json({ id, message: 'Worker qualification & certification recorded.' });
});

app.get('/api/admin/audit-logs', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { action = '' } = req.query as Record<string, string>;
  let sql = `
    SELECT a.*, u.full_name as user_name, u.employee_code, r.name as role_name
    FROM audit_logs a
    JOIN users u ON a.user_id = u.id
    JOIN roles r ON u.role_id = r.id
  `;
  const params: any[] = [];
  if (action) {
    sql += ` WHERE a.action = ?`;
    params.push(action);
  }
  sql += ` ORDER BY a.created_at DESC LIMIT 100`;
  const logs = db.prepare(sql).all(...params);
  res.json({ logs });
});

// ============================================================================
// 3. WORKFORCE & ATTENDANCE APIs (/api/workers, /api/attendance)
// ============================================================================
app.get('/api/workers', requireAuth, requireRoles('ADMIN', 'MANAGER', 'TECHNICIAN'), (req, res) => {
  const { departmentId = '', availability = '', skillCode = '', search = '' } = req.query as Record<string, string>;
  let workers = db.prepare(`
    SELECT w.*, u.full_name, u.email, u.employee_code, u.phone, d.name as department_name,
           m.machine_code as assigned_machine_code, m.name as assigned_machine_name
    FROM workers w
    JOIN users u ON w.user_id = u.id
    JOIN departments d ON w.department_id = d.id
    LEFT JOIN machines m ON w.assigned_machine_id = m.id
    WHERE u.is_active = 1
    ORDER BY u.employee_code ASC
  `).all() as any[];

  const getSkills = db.prepare(`
    SELECT s.id as skill_id, s.code, s.name, ws.proficiency_level
    FROM worker_skills ws
    JOIN skills s ON ws.skill_id = s.id
    WHERE ws.worker_id = ?
  `);
  const getCerts = db.prepare(`SELECT * FROM certifications WHERE worker_id = ?`);
  const today = new Date().toISOString().slice(0, 10);
  const getAtt = db.prepare(`SELECT * FROM attendance WHERE worker_id = ? AND attendance_date = ?`);

  workers = workers.map((w) => ({
    ...w,
    skills: getSkills.all(w.id),
    certifications: getCerts.all(w.id),
    todayAttendance: getAtt.get(w.id, today) || null,
  }));

  if (departmentId) workers = workers.filter((w) => w.department_id === departmentId);
  if (availability) workers = workers.filter((w) => w.availability === availability);
  if (skillCode) workers = workers.filter((w) => w.skills.some((s: any) => s.code === skillCode));
  if (search) {
    const q = search.toLowerCase();
    workers = workers.filter(
      (w) =>
        w.full_name.toLowerCase().includes(q) ||
        w.employee_code.toLowerCase().includes(q) ||
        w.designation.toLowerCase().includes(q)
    );
  }

  res.json({ workers });
});

app.get('/api/workers/:id/skills', requireAuth, (req, res) => {
  const skills = db.prepare(`
    SELECT s.*, ws.proficiency_level
    FROM worker_skills ws JOIN skills s ON ws.skill_id = s.id
    WHERE ws.worker_id = ?
  `).all(req.params.id);
  const certifications = db.prepare(`SELECT * FROM certifications WHERE worker_id = ?`).all(req.params.id);
  res.json({ skills, certifications });
});

app.patch('/api/workers/:id', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { id } = req.params;
  const { availability, assignedMachineId, departmentId, designation } = req.body || {};
  const existing = db.prepare(`
    SELECT w.*, u.id as uid, u.full_name FROM workers w JOIN users u ON w.user_id = u.id WHERE w.id = ?
  `).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Worker record not found.' });

  db.prepare(`
    UPDATE workers
    SET availability = ?, assigned_machine_id = ?, department_id = ?, designation = ?
    WHERE id = ?
  `).run(
    availability ?? existing.availability,
    assignedMachineId !== undefined ? assignedMachineId : existing.assigned_machine_id,
    departmentId ?? existing.department_id,
    designation ?? existing.designation,
    id
  );

  createAuditLog(req.user!.id, 'WORKER_ALLOCATED', 'WORKER', id, `Updated allocation/availability for ${existing.full_name}`);
  createNotification(existing.uid, 'TASK', 'Workforce Allocation Updated', `Your operational status or machine assignment was updated by ${req.user!.fullName}.`, '/worker/dashboard');
  res.json({ message: 'Worker allocation updated.' });
});

// Worker Dashboard Personal Endpoint
app.get('/api/worker/me', requireAuth, requireRoles('WORKER'), (req, res) => {
  const w = db.prepare(`
    SELECT w.*, u.full_name, u.email, u.employee_code, u.phone, d.name as department_name,
           m.id as machine_id, m.machine_code, m.name as machine_name, m.status as machine_status,
           m.machine_type, m.instructions as machine_instructions, m.capacity_units_per_hr
    FROM workers w
    JOIN users u ON w.user_id = u.id
    JOIN departments d ON w.department_id = d.id
    LEFT JOIN machines m ON w.assigned_machine_id = m.id
    WHERE w.user_id = ?
  `).get(req.user!.id) as any;

  if (!w) return res.status(404).json({ error: 'Worker profile not found.' });

  const skills = db.prepare(`
    SELECT s.code, s.name, s.category, ws.proficiency_level
    FROM worker_skills ws JOIN skills s ON ws.skill_id = s.id
    WHERE ws.worker_id = ?
  `).all(w.id);

  const certifications = db.prepare(`SELECT * FROM certifications WHERE worker_id = ?`).all(w.id);

  const shifts = db.prepare(`
    SELECT sa.id as assignment_id, sa.status as assignment_status, s.*, d.name as department_name
    FROM shift_assignments sa
    JOIN shifts s ON sa.shift_id = s.id
    JOIN departments d ON s.department_id = d.id
    WHERE sa.worker_id = ?
    ORDER BY s.shift_date DESC, s.start_time ASC
  `).all(w.id);

  const tasks = db.prepare(`
    SELECT pt.*, po.order_code, po.product_name, po.priority, po.status as order_status,
           m.machine_code, m.name as machine_name, m.status as machine_status
    FROM production_tasks pt
    JOIN production_orders po ON pt.order_id = po.id
    JOIN machines m ON pt.machine_id = m.id
    WHERE pt.worker_id = ?
    ORDER BY pt.updated_at DESC
  `).all(w.id);

  const attendance = db.prepare(`
    SELECT * FROM attendance WHERE worker_id = ? ORDER BY attendance_date DESC LIMIT 14
  `).all(w.id);

  const safetyReports = db.prepare(`
    SELECT si.*, d.name as department_name
    FROM safety_incidents si
    JOIN departments d ON si.department_id = d.id
    WHERE si.reported_by_id = ?
    ORDER BY si.created_at DESC
  `).all(req.user!.id);

  const faultReports = db.prepare(`
    SELECT mr.*, m.machine_code, m.name as machine_name
    FROM maintenance_requests mr
    JOIN machines m ON mr.machine_id = m.id
    WHERE mr.reported_by_id = ?
    ORDER BY mr.created_at DESC
  `).all(req.user!.id);

  const allMachines = db.prepare(`SELECT id, machine_code, name, status FROM machines ORDER BY machine_code ASC`).all();

  res.json({
    worker: w,
    skills,
    certifications,
    shifts,
    tasks,
    attendance,
    safetyReports,
    faultReports,
    allMachines,
  });
});

app.get('/api/attendance', requireAuth, (req, res) => {
  if (req.user!.role === 'WORKER') {
    const records = db.prepare(`
      SELECT * FROM attendance WHERE worker_id = ? ORDER BY attendance_date DESC LIMIT 30
    `).all(req.user!.workerId);
    return res.json({ attendance: records });
  }
  const records = db.prepare(`
    SELECT a.*, u.full_name, u.employee_code, d.name as department_name
    FROM attendance a
    JOIN workers w ON a.worker_id = w.id
    JOIN users u ON w.user_id = u.id
    JOIN departments d ON w.department_id = d.id
    ORDER BY a.attendance_date DESC, u.employee_code ASC
    LIMIT 100
  `).all();
  res.json({ attendance: records });
});

app.post('/api/attendance/check-in', requireAuth, requireRoles('WORKER'), (req, res) => {
  const workerId = req.user!.workerId;
  if (!workerId) return res.status(400).json({ error: 'Worker profile missing.' });

  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  const existing = db.prepare('SELECT * FROM attendance WHERE worker_id = ? AND attendance_date = ?').get(workerId, today) as any;
  if (existing && existing.check_in_time && existing.status === 'PRESENT') {
    return res.status(400).json({ error: `Already checked in today at ${existing.check_in_time}. Duplicate check-in prevented.` });
  }

  if (existing) {
    db.prepare(`
      UPDATE attendance SET check_in_time = ?, check_out_time = NULL, status = 'PRESENT' WHERE id = ?
    `).run(nowTime, existing.id);
  } else {
    db.prepare(`
      INSERT INTO attendance (id, worker_id, attendance_date, check_in_time, check_out_time, hours_worked, status)
      VALUES (?, ?, ?, ?, NULL, 0, 'PRESENT')
    `).run(uuid(), workerId, today, nowTime);
  }

  db.prepare(`UPDATE workers SET availability = CASE WHEN assigned_machine_id IS NOT NULL THEN 'ASSIGNED' ELSE 'AVAILABLE' END WHERE id = ?`).run(workerId);
  createAuditLog(req.user!.id, 'ATTENDANCE_CHECK_IN', 'ATTENDANCE', workerId, `${req.user!.fullName} checked in at ${nowTime}`);
  res.json({ message: `Checked in at ${nowTime}.`, checkInTime: nowTime });
});

app.post('/api/attendance/check-out', requireAuth, requireRoles('WORKER'), (req, res) => {
  const workerId = req.user!.workerId;
  if (!workerId) return res.status(400).json({ error: 'Worker profile missing.' });

  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  const existing = db.prepare('SELECT * FROM attendance WHERE worker_id = ? AND attendance_date = ?').get(workerId, today) as any;
  if (!existing || !existing.check_in_time) {
    return res.status(400).json({ error: 'Cannot check out without an active check-in record for today.' });
  }
  if (existing.status === 'CHECKED_OUT') {
    return res.status(400).json({ error: `Already checked out today at ${existing.check_out_time}.` });
  }

  const [inH, inM] = existing.check_in_time.split(':').map(Number);
  const [outH, outM] = nowTime.split(':').map(Number);
  const diffHrs = Math.max(0.5, Number((((outH * 60 + outM) - (inH * 60 + inM)) / 60).toFixed(2)));
  const finalHrs = diffHrs > 0 ? diffHrs : Number((existing.hours_worked || 8.0).toFixed(1));

  db.prepare(`
    UPDATE attendance SET check_out_time = ?, hours_worked = ?, status = 'CHECKED_OUT' WHERE id = ?
  `).run(nowTime, finalHrs, existing.id);

  createAuditLog(req.user!.id, 'ATTENDANCE_CHECK_OUT', 'ATTENDANCE', workerId, `${req.user!.fullName} checked out at ${nowTime} (${finalHrs} hrs)`);
  res.json({ message: `Checked out at ${nowTime}. Recorded ${finalHrs} working hours.` });
});

// ============================================================================
// 4. SHIFT PLANNING APIs (/api/shifts)
// ============================================================================
app.get('/api/shifts', requireAuth, (_req, res) => {
  const shifts = db.prepare(`
    SELECT s.*, d.name as department_name
    FROM shifts s
    JOIN departments d ON s.department_id = d.id
    ORDER BY s.shift_date DESC, s.start_time ASC
  `).all() as any[];

  const getAssigned = db.prepare(`
    SELECT sa.id, sa.worker_id, sa.status, u.full_name, u.employee_code, w.designation, w.availability
    FROM shift_assignments sa
    JOIN workers w ON sa.worker_id = w.id
    JOIN users u ON w.user_id = u.id
    WHERE sa.shift_id = ?
  `);

  const enriched = shifts.map((s) => ({
    ...s,
    assignments: getAssigned.all(s.id),
  }));

  res.json({ shifts: enriched });
});

app.post('/api/shifts', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { departmentId, name, shiftDate, requiredWorkers } = req.body || {};
  if (!departmentId || !name || !shiftDate) {
    return res.status(400).json({ error: 'Department, shift type (Morning/Afternoon/Night), and date are required.' });
  }
  const timings: Record<string, { start: string; end: string }> = {
    Morning: { start: '06:00', end: '14:00' },
    Afternoon: { start: '14:00', end: '22:00' },
    Night: { start: '22:00', end: '06:00' },
  };
  const slot = timings[name] || timings.Morning;
  const id = uuid();

  db.prepare(`
    INSERT INTO shifts (id, department_id, name, shift_date, start_time, end_time, required_workers, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, departmentId, name, shiftDate, slot.start, slot.end, Number(requiredWorkers || 6), new Date().toISOString());

  createAuditLog(req.user!.id, 'SHIFT_CREATED', 'SHIFT', id, `Created ${name} shift on ${shiftDate}`);
  res.status(201).json({ id, message: `${name} shift scheduled for ${shiftDate}.` });
});

app.post('/api/shifts/assign', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { shiftId, workerId } = req.body || {};
  if (!shiftId || !workerId) return res.status(400).json({ error: 'Shift and worker are required.' });

  const targetShift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as any;
  if (!targetShift) return res.status(404).json({ error: 'Shift not found.' });

  const worker = db.prepare(`
    SELECT w.*, u.id as uid, u.full_name FROM workers w JOIN users u ON w.user_id = u.id WHERE w.id = ?
  `).get(workerId) as any;
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });
  if (worker.availability === 'ABSENT') {
    return res.status(400).json({ error: `Conflict: ${worker.full_name} is marked ABSENT and cannot be scheduled.` });
  }

  // Prevent overlapping shift assignment on the same date & shift window
  const overlap = db.prepare(`
    SELECT s.name, s.start_time, s.end_time
    FROM shift_assignments sa
    JOIN shifts s ON sa.shift_id = s.id
    WHERE sa.worker_id = ? AND s.shift_date = ? AND (s.id = ? OR s.name = ?)
  `).get(workerId, targetShift.shift_date, shiftId, targetShift.name) as any;

  if (overlap) {
    return res.status(400).json({
      error: `Scheduling conflict prevented: ${worker.full_name} is already assigned to ${overlap.name} shift (${overlap.start_time}–${overlap.end_time}) on ${targetShift.shift_date}.`,
    });
  }

  db.prepare(`
    INSERT INTO shift_assignments (id, shift_id, worker_id, status, created_at)
    VALUES (?, ?, ?, 'SCHEDULED', ?)
  `).run(uuid(), shiftId, workerId, new Date().toISOString());

  createAuditLog(req.user!.id, 'SHIFT_WORKER_ASSIGNED', 'SHIFT', shiftId, `Assigned ${worker.full_name} to ${targetShift.name} shift (${targetShift.shift_date})`);
  createNotification(worker.uid, 'SHIFT', `Assigned to ${targetShift.name} Shift`, `You have been scheduled for the ${targetShift.name} shift (${targetShift.start_time}–${targetShift.end_time}) on ${targetShift.shift_date}.`, '/worker/dashboard');

  res.status(201).json({ message: `${worker.full_name} assigned to ${targetShift.name} shift.` });
});

app.get('/api/shift-assignments', requireAuth, (_req, res) => {
  const assignments = db.prepare(`
    SELECT sa.*, s.name as shift_name, s.shift_date, s.start_time, s.end_time,
           u.full_name, u.employee_code, d.name as department_name
    FROM shift_assignments sa
    JOIN shifts s ON sa.shift_id = s.id
    JOIN departments d ON s.department_id = d.id
    JOIN workers w ON sa.worker_id = w.id
    JOIN users u ON w.user_id = u.id
    ORDER BY s.shift_date DESC
  `).all();
  res.json({ assignments });
});

// ============================================================================
// 5. MACHINE REGISTRY & WORKFLOWS (/api/machines)
// ============================================================================
app.get('/api/machines', requireAuth, (_req, res) => {
  const machines = db.prepare(`
    SELECT m.*, d.name as department_name, f.name as factory_name
    FROM machines m
    JOIN departments d ON m.department_id = d.id
    JOIN factories f ON m.factory_id = f.id
    ORDER BY m.machine_code ASC
  `).all() as any[];

  const getWorkers = db.prepare(`
    SELECT w.id, u.full_name, u.employee_code
    FROM workers w JOIN users u ON w.user_id = u.id
    WHERE w.assigned_machine_id = ?
  `);
  const getOrders = db.prepare(`
    SELECT id, order_code, product_name, status, target_qty, produced_qty
    FROM production_orders
    WHERE machine_id = ? AND status != 'COMPLETED'
  `);

  const enriched = machines.map((m) => ({
    ...m,
    assignedWorkers: getWorkers.all(m.id),
    activeOrders: getOrders.all(m.id),
  }));

  res.json({ machines: enriched });
});

app.post('/api/machines', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { factoryId, departmentId, machineCode, name, machineType, capacityUnitsPerHr, requiredSkillCode, requiredCertName, instructions } = req.body || {};
  if (!departmentId || !machineCode || !name || !machineType) {
    return res.status(400).json({ error: 'Department, machine code, name, and machine type are required.' });
  }
  const facId = factoryId || (db.prepare('SELECT id FROM factories LIMIT 1').get() as any).id;
  const id = uuid();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO machines (id, factory_id, department_id, machine_code, name, machine_type, status, capacity_units_per_hr, utilization_pct, required_skill_code, required_cert_name, instructions, last_serviced_date, is_demo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'IDLE', ?, 0, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      facId,
      departmentId,
      String(machineCode).trim().toUpperCase(),
      String(name).trim(),
      String(machineType).trim(),
      Number(capacityUnitsPerHr || 45),
      requiredSkillCode || 'CNC_MILLING',
      requiredCertName || null,
      instructions || 'Follow standard lockout-tagout and pre-shift calibration checklist.',
      now.slice(0, 10),
      now
    );

    createAuditLog(req.user!.id, 'MACHINE_REGISTERED', 'MACHINE', id, `Registered machine ${machineCode} (${name})`);
    res.status(201).json({ id, message: 'Machine registered in asset registry.' });
  } catch (err: any) {
    res.status(400).json({ error: 'Machine code already exists in registry.' });
  }
});

app.patch('/api/machines/:id', requireAuth, requireRoles('ADMIN', 'MANAGER'), (req, res) => {
  const { id } = req.params;
  const { status, reason, name, departmentId, capacityUnitsPerHr, utilizationPct, instructions } = req.body || {};
  const existing = db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Machine not found.' });

  const newStatus = status || existing.status;
  const newUtil =
    utilizationPct !== undefined
      ? Number(utilizationPct)
      : newStatus === 'FAULT' || newStatus === 'MAINTENANCE'
      ? 0
      : newStatus === 'IDLE'
      ? 25
      : Math.max(75, existing.utilization_pct);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE machines
      SET status = ?, name = ?, department_id = ?, capacity_units_per_hr = ?, utilization_pct = ?, instructions = ?
      WHERE id = ?
    `).run(
      newStatus,
      name ?? existing.name,
      departmentId ?? existing.department_id,
      capacityUnitsPerHr !== undefined ? Number(capacityUnitsPerHr) : existing.capacity_units_per_hr,
      newUtil,
      instructions ?? existing.instructions,
      id
    );

    if (status && status !== existing.status) {
      db.prepare(`
        INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(),
        id,
        existing.status,
        newStatus,
        req.user!.id,
        reason || `Operational status change by ${req.user!.fullName}`,
        new Date().toISOString()
      );
    }
  });
  tx();

  createAuditLog(req.user!.id, 'MACHINE_UPDATED', 'MACHINE', id, `Updated ${existing.machine_code}: status ${existing.status} -> ${newStatus}`);
  res.json({ message: `Machine ${existing.machine_code} updated.` });
});

app.get('/api/machines/:id/history', requireAuth, (req, res) => {
  const statusLogs = db.prepare(`
    SELECT l.*, u.full_name as changed_by_name
    FROM machine_status_logs l
    JOIN users u ON l.changed_by_id = u.id
    WHERE l.machine_id = ?
    ORDER BY l.created_at DESC
  `).all(req.params.id);

  const maintenanceHistory = db.prepare(`
    SELECT mr.*, u.full_name as tech_name
    FROM maintenance_requests mr
    LEFT JOIN users u ON mr.assigned_tech_id = u.id
    WHERE mr.machine_id = ?
    ORDER BY mr.created_at DESC
  `).all(req.params.id);

  res.json({ statusLogs, maintenanceHistory });
});

// ============================================================================
// 6. PRODUCTION MANAGEMENT APIs (/api/production/*)
// ============================================================================
app.get('/api/production/orders', requireAuth, (_req, res) => {
  const orders = db.prepare(`
    SELECT po.*, d.name as department_name, m.machine_code, m.name as machine_name, m.status as machine_status
    FROM production_orders po
    JOIN departments d ON po.department_id = d.id
    LEFT JOIN machines m ON po.machine_id = m.id
    ORDER BY po.created_at DESC
  `).all() as any[];

  const getTasks = db.prepare(`
    SELECT pt.*, u.full_name as worker_name, u.employee_code
    FROM production_tasks pt
    JOIN workers w ON pt.worker_id = w.id
    JOIN users u ON w.user_id = u.id
    WHERE pt.order_id = ?
  `);

  res.json({
    orders: orders.map((o) => ({
      ...o,
      tasks: getTasks.all(o.id),
    })),
  });
});

app.post('/api/production/orders', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { departmentId, machineId, workerId, productName, targetQty, priority, deadline } = req.body || {};
  if (!departmentId || !productName || !targetQty || !deadline) {
    return res.status(400).json({ error: 'Department, product name, target quantity, and deadline are required.' });
  }

  const factoryId = (db.prepare('SELECT id FROM factories LIMIT 1').get() as any).id;
  const orderId = uuid();
  const orderCode = `PO-2026-${Math.floor(820 + Math.random() * 170)}`;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO production_orders (id, order_code, factory_id, department_id, machine_id, product_name, target_qty, produced_qty, downtime_mins, priority, status, deadline, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0, ?, ?)
    `).run(
      orderId,
      orderCode,
      factoryId,
      departmentId,
      machineId || null,
      String(productName).trim(),
      Number(targetQty),
      priority || 'HIGH',
      workerId && machineId ? 'IN_PROGRESS' : 'NOT_STARTED',
      deadline,
      now,
      now
    );

    if (workerId && machineId) {
      db.prepare(`
        INSERT INTO production_tasks (id, order_id, worker_id, machine_id, title, target_qty, completed_qty, status, deadline, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'IN_PROGRESS', ?, ?)
      `).run(uuid(), orderId, workerId, machineId, `${productName} — Primary Run`, Number(targetQty), deadline, now);

      db.prepare(`UPDATE workers SET availability = 'ASSIGNED', assigned_machine_id = ? WHERE id = ?`).run(machineId, workerId);
      db.prepare(`UPDATE machines SET status = 'OPERATING', utilization_pct = 85 WHERE id = ? AND status = 'IDLE'`).run(machineId);

      const wUser = db.prepare('SELECT user_id FROM workers WHERE id = ?').get(workerId) as any;
      if (wUser) {
        createNotification(
          wUser.user_id,
          'TASK',
          `New Production Order Assigned: ${orderCode}`,
          `Assigned to ${productName} (Target: ${targetQty} units, Due: ${deadline}).`,
          '/worker/dashboard'
        );
      }
    }
  });
  tx();

  createAuditLog(req.user!.id, 'PRODUCTION_ORDER_CREATED', 'PRODUCTION_ORDER', orderId, `Created production order ${orderCode} (${productName}, ${targetQty} units)`);
  res.status(201).json({ id: orderId, orderCode, message: `Production order ${orderCode} created.` });
});

app.patch('/api/production/orders/:id', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { id } = req.params;
  const { status, priority, deadline, targetQty, machineId } = req.body || {};
  const existing = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Production order not found.' });

  const now = new Date().toISOString();
  const nextStatus = status ?? existing.status;
  const nextProduced = nextStatus === 'COMPLETED' ? Math.max(existing.produced_qty, existing.target_qty) : existing.produced_qty;

  db.prepare(`
    UPDATE production_orders
    SET status = ?, priority = ?, deadline = ?, target_qty = ?, machine_id = ?, produced_qty = ?, updated_at = ?
    WHERE id = ?
  `).run(
    nextStatus,
    priority ?? existing.priority,
    deadline ?? existing.deadline,
    targetQty !== undefined ? Number(targetQty) : existing.target_qty,
    machineId !== undefined ? machineId : existing.machine_id,
    nextProduced,
    now,
    id
  );

  createAuditLog(req.user!.id, 'PRODUCTION_ORDER_UPDATED', 'PRODUCTION_ORDER', id, `Updated ${existing.order_code} to status ${nextStatus}`);
  res.json({ message: `Order ${existing.order_code} updated.` });
});

app.post('/api/production/logs', requireAuth, (req, res) => {
  const { orderId, taskId, outputDelta, downtimeMins, notes, markCompleted } = req.body || {};
  if (!orderId && !taskId) {
    return res.status(400).json({ error: 'Order ID or Task ID is required.' });
  }

  let resolvedOrderId = orderId;
  const delta = Number(outputDelta || 0);
  const down = Number(downtimeMins || 0);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    if (taskId) {
      const task = db.prepare('SELECT * FROM production_tasks WHERE id = ?').get(taskId) as any;
      if (!task) throw new Error('Assigned task not found.');
      resolvedOrderId = task.order_id;
      const newTaskQty = Math.min(task.target_qty, task.completed_qty + delta);
      const nextTaskStatus = markCompleted || newTaskQty >= task.target_qty ? 'COMPLETED' : 'IN_PROGRESS';
      db.prepare(`
        UPDATE production_tasks SET completed_qty = ?, status = ?, updated_at = ? WHERE id = ?
      `).run(newTaskQty, nextTaskStatus, now, taskId);
    }

    const order = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(resolvedOrderId) as any;
    if (!order) throw new Error('Production order not found.');

    const newProd = order.produced_qty + delta;
    const newDown = order.downtime_mins + down;
    const newStatus = newProd >= order.target_qty ? 'COMPLETED' : order.status === 'NOT_STARTED' ? 'IN_PROGRESS' : order.status;

    db.prepare(`
      UPDATE production_orders
      SET produced_qty = ?, downtime_mins = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(newProd, newDown, newStatus, now, resolvedOrderId);

    db.prepare(`
      INSERT INTO production_logs (id, order_id, recorded_by_id, output_delta, downtime_mins, notes, log_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), resolvedOrderId, req.user!.id, delta, down, notes || null, now.slice(0, 10), now);

    if (req.user!.role === 'WORKER') {
      notifyRole(
        'MANAGER',
        'TASK',
        `Production Output Logged: ${order.order_code}`,
        `${req.user!.fullName} recorded +${delta} units on ${order.product_name} (${newProd}/${order.target_qty}).`,
        '/manager/dashboard?tab=production'
      );
    }
  });

  try {
    tx();
    createAuditLog(req.user!.id, 'PRODUCTION_LOGGED', 'PRODUCTION_ORDER', resolvedOrderId, `Recorded +${delta} units output (${down}m downtime)`);
    res.status(201).json({ message: 'Production progress recorded and synchronized.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not log production output.' });
  }
});

// ============================================================================
// 7. WORKPLACE SAFETY APIs (/api/safety/*)
// ============================================================================
app.get('/api/safety/incidents', requireAuth, (_req, res) => {
  const incidents = db.prepare(`
    SELECT si.*, d.name as department_name, u.full_name as reported_by_name, u.employee_code as reporter_code
    FROM safety_incidents si
    JOIN departments d ON si.department_id = d.id
    JOIN users u ON si.reported_by_id = u.id
    ORDER BY si.created_at DESC
  `).all() as any[];

  const getActions = db.prepare(`
    SELECT sa.*, u.full_name as assigned_to_name
    FROM safety_actions sa
    JOIN users u ON sa.assigned_to_id = u.id
    WHERE sa.incident_id = ?
  `);

  res.json({
    incidents: incidents.map((inc) => ({
      ...inc,
      actions: getActions.all(inc.id),
    })),
  });
});

app.post('/api/safety/incidents', requireAuth, (req, res) => {
  const { departmentId, incidentType, category, severity, description } = req.body || {};
  if (!category || !severity || !description) {
    return res.status(400).json({ error: 'Category, severity, and incident description are required.' });
  }
  const deptId = departmentId || req.user!.departmentId || (db.prepare('SELECT id FROM departments LIMIT 1').get() as any).id;
  const id = uuid();
  const code = `SAF-2026-${Math.floor(100 + Math.random() * 890)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO safety_incidents (id, incident_code, department_id, reported_by_id, incident_type, category, severity, description, status, created_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, NULL)
  `).run(id, code, deptId, req.user!.id, incidentType || 'HAZARD', category, severity, String(description).trim(), now);

  notifyRole('MANAGER', 'SAFETY', `New Safety ${incidentType || 'Hazard'}: ${code}`, `${req.user!.fullName} reported a ${severity} severity ${category} issue.`, '/manager/dashboard?tab=safety');
  createAuditLog(req.user!.id, 'SAFETY_REPORTED', 'SAFETY_INCIDENT', id, `Reported ${severity} safety ${incidentType || 'HAZARD'} (${code})`);

  res.status(201).json({ id, incidentCode: code, message: `Safety report ${code} submitted and escalated to Management.` });
});

app.patch('/api/safety/incidents/:id', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { id } = req.params;
  const { status, assignedToId, actionPlan, deadline } = req.body || {};
  const existing = db.prepare('SELECT * FROM safety_incidents WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Safety incident not found.' });

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    if (actionPlan && assignedToId) {
      db.prepare(`
        INSERT INTO safety_actions (id, incident_id, assigned_to_id, action_plan, deadline, status, completed_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', NULL)
      `).run(uuid(), id, assignedToId, String(actionPlan).trim(), deadline || now.slice(0, 10));

      db.prepare(`UPDATE safety_incidents SET status = 'ACTION_ASSIGNED' WHERE id = ?`).run(id);
      createNotification(assignedToId, 'SAFETY', `Corrective Safety Action Assigned: ${existing.incident_code}`, actionPlan, '/technician/dashboard');
    }

    if (status === 'RESOLVED') {
      db.prepare(`UPDATE safety_incidents SET status = 'RESOLVED', resolved_at = ? WHERE id = ?`).run(now, id);
      db.prepare(`UPDATE safety_actions SET status = 'COMPLETED', completed_at = ? WHERE incident_id = ?`).run(now, id);
      createNotification(existing.reported_by_id, 'SAFETY', `Safety Report ${existing.incident_code} Resolved`, 'Corrective measures verified and closed.', '/worker/dashboard');
    }
  });
  tx();

  createAuditLog(req.user!.id, 'SAFETY_ACTION_UPDATED', 'SAFETY_INCIDENT', id, `Updated safety incident ${existing.incident_code}`);
  res.json({ message: `Safety incident ${existing.incident_code} updated.` });
});

// ============================================================================
// 8. MAINTENANCE & FAULT REPORTING APIs (/api/maintenance/*)
// ============================================================================
app.get('/api/maintenance/requests', requireAuth, (req, res) => {
  const requests = db.prepare(`
    SELECT mr.*, m.machine_code, m.name as machine_name, m.status as machine_status, d.name as department_name,
           rep.full_name as reported_by_name, tech.full_name as assigned_tech_name
    FROM maintenance_requests mr
    JOIN machines m ON mr.machine_id = m.id
    JOIN departments d ON m.department_id = d.id
    JOIN users rep ON mr.reported_by_id = rep.id
    LEFT JOIN users tech ON mr.assigned_tech_id = tech.id
    ORDER BY
      CASE mr.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
      mr.created_at DESC
  `).all();

  const schedules = db.prepare(`
    SELECT ms.*, m.machine_code, m.name as machine_name, u.full_name as technician_name
    FROM maintenance_schedules ms
    JOIN machines m ON ms.machine_id = m.id
    JOIN users u ON ms.technician_id = u.id
    ORDER BY ms.scheduled_date ASC
  `).all();

  const technicians = db.prepare(`
    SELECT u.id, u.full_name, u.employee_code
    FROM users u JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'TECHNICIAN' AND u.is_active = 1
  `).all();

  res.json({ requests, schedules, technicians });
});

// Connected Workflow A: Worker/Manager reports fault -> Machine status FAULT -> Notify Manager + Technicians -> Available to Recovery Engine
app.post('/api/maintenance/requests', requireAuth, (req, res) => {
  const { machineId, faultCategory, priority, description } = req.body || {};
  if (!machineId || !faultCategory || !description) {
    return res.status(400).json({ error: 'Machine, fault category, and fault description are required.' });
  }

  const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(machineId) as any;
  if (!machine) return res.status(404).json({ error: 'Machine not found.' });

  const id = uuid();
  const reqCode = `MNT-2026-${Math.floor(310 + Math.random() * 650)}`;
  const sev = priority || 'HIGH';
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO maintenance_requests (id, request_code, machine_id, reported_by_id, assigned_tech_id, fault_category, priority, description, status, scheduled_date, downtime_minutes, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'REPORTED', ?, 0, ?)
    `).run(id, reqCode, machineId, req.user!.id, faultCategory, sev, String(description).trim(), now.slice(0, 10), now);

    // Update machine status to FAULT through authorized fault-reporting workflow
    if (machine.status !== 'FAULT') {
      db.prepare(`UPDATE machines SET status = 'FAULT', utilization_pct = 0 WHERE id = ?`).run(machineId);
      db.prepare(`
        INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at)
        VALUES (?, ?, ?, 'FAULT', ?, ?, ?)
      `).run(uuid(), machineId, machine.status, req.user!.id, `Fault report ${reqCode}: ${faultCategory}`, now);
    }

    // Mark affected in-progress orders as DELAYED if critical/high
    if (sev === 'CRITICAL' || sev === 'HIGH') {
      db.prepare(`
        UPDATE production_orders SET status = 'DELAYED', updated_at = ?
        WHERE machine_id = ? AND status = 'IN_PROGRESS'
      `).run(now, machineId);
    }

    db.prepare(`
      INSERT INTO maintenance_logs (id, request_id, actor_id, status_from, status_to, notes, created_at)
      VALUES (?, ?, ?, 'NONE', 'REPORTED', ?, ?)
    `).run(uuid(), id, req.user!.id, `Fault reported by ${req.user!.fullName}: ${description}`, now);
  });
  tx();

  notifyRole('MANAGER', 'FAULT', `Machine Fault Reported: ${machine.machine_code} (${reqCode})`, `${faultCategory} (${sev}). Open Intelligent Recovery Engine to reallocate affected orders.`, '/manager/recovery-engine');
  notifyRole('TECHNICIAN', 'MAINTENANCE', `New ${sev} Fault Request: ${reqCode}`, `${machine.machine_code} (${machine.name}) — ${faultCategory}.`, '/technician/dashboard');
  createAuditLog(req.user!.id, 'FAULT_REPORTED', 'MAINTENANCE_REQUEST', id, `Submitted ${sev} fault ${reqCode} on ${machine.machine_code}`);

  res.status(201).json({ id, requestCode: reqCode, message: `Fault ${reqCode} logged. Machine set to FAULT, Manager & Maintenance notified.` });
});

app.patch('/api/maintenance/requests/:id', requireAuth, requireRoles('MANAGER', 'TECHNICIAN', 'ADMIN'), (req, res) => {
  const { id } = req.params;
  const { status, assignedTechId, scheduledDate, diagnosis, repairNotes, partsUsed, downtimeMinutes } = req.body || {};
  const existing = db.prepare(`
    SELECT mr.*, m.machine_code, m.name as machine_name
    FROM maintenance_requests mr JOIN machines m ON mr.machine_id = m.id
    WHERE mr.id = ?
  `).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Maintenance request not found.' });

  const now = new Date().toISOString();
  const nextStatus = status || (assignedTechId && existing.status === 'REPORTED' ? 'ASSIGNED' : existing.status);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE maintenance_requests
      SET status = ?, assigned_tech_id = ?, scheduled_date = ?, diagnosis = ?, repair_notes = ?, parts_used = ?, downtime_minutes = ?
      WHERE id = ?
    `).run(
      nextStatus,
      assignedTechId !== undefined ? assignedTechId : existing.assigned_tech_id,
      scheduledDate ?? existing.scheduled_date,
      diagnosis ?? existing.diagnosis,
      repairNotes ?? existing.repair_notes,
      partsUsed ?? existing.parts_used,
      downtimeMinutes !== undefined ? Number(downtimeMinutes) : existing.downtime_minutes,
      id
    );

    if (nextStatus === 'IN_PROGRESS') {
      db.prepare(`UPDATE machines SET status = 'MAINTENANCE', utilization_pct = 0 WHERE id = ?`).run(existing.machine_id);
    }

    db.prepare(`
      INSERT INTO maintenance_logs (id, request_id, actor_id, status_from, status_to, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), id, req.user!.id, existing.status, nextStatus, repairNotes || diagnosis || `Updated to ${nextStatus}`, now);

    if (assignedTechId && assignedTechId !== existing.assigned_tech_id) {
      createNotification(assignedTechId, 'MAINTENANCE', `Maintenance Request Assigned: ${existing.request_code}`, `Assigned to ${existing.machine_code} (${existing.fault_category}).`, '/technician/dashboard');
    }
  });
  tx();

  createAuditLog(req.user!.id, 'MAINTENANCE_UPDATED', 'MAINTENANCE_REQUEST', id, `Updated ${existing.request_code} (${existing.status} -> ${nextStatus})`);
  res.json({ message: `Maintenance request ${existing.request_code} updated to ${nextStatus}.` });
});

// Connected Workflow C: Technician submits completion OR Manager confirms -> Machine restored to IDLE/OPERATING -> Recovery Engine & Dashboards updated
app.post('/api/maintenance/requests/:id/complete', requireAuth, requireRoles('TECHNICIAN', 'MANAGER', 'ADMIN'), (req, res) => {
  const { id } = req.params;
  const { diagnosis, repairNotes, partsUsed, downtimeMinutes, restoreMachineStatus } = req.body || {};

  const existing = db.prepare(`
    SELECT mr.*, m.machine_code, m.name as machine_name, m.status as current_machine_status
    FROM maintenance_requests mr JOIN machines m ON mr.machine_id = m.id
    WHERE mr.id = ?
  `).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Maintenance request not found.' });

  const now = new Date().toISOString();
  const isManagerConfirming = req.user!.role === 'MANAGER' || req.user!.role === 'ADMIN';
  // Technicians submit completion report; if manager confirms or standard completion workflow runs, machine becomes IDLE (operational & ready)
  const finalStatus = 'COMPLETED';
  const targetMachineState = restoreMachineStatus || 'IDLE';

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE maintenance_requests
      SET status = ?, diagnosis = ?, repair_notes = ?, parts_used = ?, downtime_minutes = ?, completed_at = ?
      WHERE id = ?
    `).run(
      finalStatus,
      diagnosis || existing.diagnosis || 'Root cause isolated and calibrated.',
      repairNotes || existing.repair_notes || 'Replaced worn assembly and verified zero-load test run.',
      partsUsed || existing.parts_used || 'Standard preventive seal & sensor kit',
      downtimeMinutes !== undefined ? Number(downtimeMinutes) : Math.max(30, existing.downtime_minutes),
      now,
      id
    );

    db.prepare(`
      UPDATE machines
      SET status = ?, utilization_pct = CASE WHEN ? = 'OPERATING' THEN 80 ELSE 20 END, last_serviced_date = ?
      WHERE id = ?
    `).run(targetMachineState, targetMachineState, now.slice(0, 10), existing.machine_id);

    db.prepare(`
      INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      existing.machine_id,
      existing.current_machine_status,
      targetMachineState,
      req.user!.id,
      `Maintenance ${existing.request_code} completed (${isManagerConfirming ? 'Manager Confirmed' : 'Technician Verified'})`,
      now
    );

    db.prepare(`
      INSERT INTO maintenance_logs (id, request_id, actor_id, status_from, status_to, notes, created_at)
      VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?)
    `).run(uuid(), id, req.user!.id, existing.status, repairNotes || 'Maintenance completed and machine returned to service.', now);
  });
  tx();

  notifyRole('MANAGER', 'MAINTENANCE', `Maintenance Completed: ${existing.machine_code}`, `${existing.request_code} resolved by ${req.user!.fullName}. Machine ${existing.machine_code} is now ${targetMachineState} and available for production/recovery.`, '/manager/dashboard?tab=maintenance');
  createNotification(existing.reported_by_id, 'MAINTENANCE', `Fault Resolved on ${existing.machine_code}`, `Maintenance request ${existing.request_code} has been completed.`, '/worker/dashboard');
  createAuditLog(req.user!.id, 'MAINTENANCE_COMPLETED', 'MAINTENANCE_REQUEST', id, `Completed ${existing.request_code} and restored ${existing.machine_code} to ${targetMachineState}`);

  res.json({ message: `Maintenance ${existing.request_code} completed. ${existing.machine_code} restored to ${targetMachineState}.` });
});

app.post('/api/maintenance/schedules', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { machineId, technicianId, title, scheduledDate, durationHrs } = req.body || {};
  if (!machineId || !technicianId || !title || !scheduledDate) {
    return res.status(400).json({ error: 'Machine, technician, title, and scheduled date are required.' });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO maintenance_schedules (id, machine_id, technician_id, title, scheduled_date, duration_hrs, status)
    VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED')
  `).run(id, machineId, technicianId, String(title).trim(), scheduledDate, Number(durationHrs || 2));

  createNotification(technicianId, 'MAINTENANCE', `Preventive Maintenance Scheduled`, `${title} scheduled for ${scheduledDate}.`, '/technician/dashboard');
  createAuditLog(req.user!.id, 'MAINTENANCE_SCHEDULED', 'MAINTENANCE_SCHEDULE', id, `Scheduled preventive maintenance "${title}" on ${scheduledDate}`);
  res.status(201).json({ id, message: 'Preventive maintenance scheduled.' });
});

// ============================================================================
// 9. INTELLIGENT FACTORY RECOVERY ENGINE (/api/recovery/*)
// ============================================================================
app.post('/api/recovery/analyze', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { eventType = 'MACHINE_FAULT', triggerEntityId, weights } = req.body || {};
  const result = analyzeDisruptionAndRecommend({
    eventType,
    triggerEntityId: triggerEntityId || '',
    weights,
    persistProposal: true,
  });
  res.json(result);
});

app.post('/api/recovery/recommend', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { eventType = 'MACHINE_FAULT', triggerEntityId, weights } = req.body || {};
  const result = analyzeDisruptionAndRecommend({
    eventType,
    triggerEntityId: triggerEntityId || '',
    weights,
    persistProposal: true,
  });
  res.json(result);
});

app.post('/api/recovery/approve', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { planId, recommendationId, customTargetMachineId, customWorkerId, isCombined, combinedStrategy } = req.body || {};
  if (!planId) return res.status(400).json({ error: 'Recovery plan ID is required.' });

  const plan = db.prepare('SELECT * FROM recovery_plans WHERE id = ?').get(planId) as any;
  if (!plan) return res.status(404).json({ error: 'Recovery plan not found.' });
  if (plan.status === 'APPROVED' || plan.status === 'APPROVED_COMBINED') {
    return res.status(400).json({ error: 'This recovery plan has already been executed.' });
  }

  const now = new Date().toISOString();

  // If executing the Combined Dual-Stream Solution
  if (isCombined) {
    const streamA = combinedStrategy?.streamA;
    const streamB = combinedStrategy?.streamB;

    if (!streamA || !streamB) {
      return res.status(400).json({ error: 'Combined strategy payload requires streamA and streamB configurations.' });
    }

    const machA = db.prepare('SELECT * FROM machines WHERE id = ?').get(streamA.machineId) as any;
    const machB = db.prepare('SELECT * FROM machines WHERE id = ?').get(streamB.machineId) as any;
    const workerA = db.prepare('SELECT w.*, u.id as uid, u.full_name FROM workers w JOIN users u ON w.user_id = u.id WHERE w.id = ?').get(streamA.workerId) as any;
    const workerB = db.prepare('SELECT w.*, u.id as uid, u.full_name FROM workers w JOIN users u ON w.user_id = u.id WHERE w.id = ?').get(streamB.workerId) as any;

    if (!machA || machA.status === 'FAULT' || machA.status === 'MAINTENANCE' || !machB || machB.status === 'FAULT' || machB.status === 'MAINTENANCE') {
      return res.status(409).json({ error: 'One or more target machines in the combined strategy are in FAULT or MAINTENANCE state.' });
    }
    if (!workerA || workerA.availability === 'ABSENT' || !workerB || workerB.availability === 'ABSENT') {
      return res.status(409).json({ error: 'One or more operators in the combined strategy are currently absent.' });
    }

    let orderId: string | null = null;
    const firstRec = db.prepare('SELECT order_id FROM recovery_recommendations WHERE plan_id = ? AND order_id IS NOT NULL LIMIT 1').get(planId) as any;
    if (firstRec?.order_id) {
      orderId = firstRec.order_id;
    }

    const tx = db.transaction(() => {
      // 1. Activate both machines
      db.prepare(`UPDATE machines SET status = 'OPERATING', utilization_pct = 88 WHERE id = ?`).run(machA.id);
      db.prepare(`UPDATE machines SET status = 'OPERATING', utilization_pct = 84 WHERE id = ?`).run(machB.id);

      db.prepare(`
        INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at)
        VALUES (?, ?, ?, 'OPERATING', ?, ?, ?)
      `).run(uuid(), machA.id, machA.status, req.user!.id, `Activated via Combined Dual-Stream Plan ${plan.plan_code} (Stream A)`, now);

      db.prepare(`
        INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at)
        VALUES (?, ?, ?, 'OPERATING', ?, ?, ?)
      `).run(uuid(), machB.id, machB.status, req.user!.id, `Activated via Combined Dual-Stream Plan ${plan.plan_code} (Stream B)`, now);

      // 2. Reallocate both workers
      db.prepare(`UPDATE workers SET availability = 'ASSIGNED', assigned_machine_id = ? WHERE id = ?`).run(machA.id, workerA.id);
      db.prepare(`UPDATE workers SET availability = 'ASSIGNED', assigned_machine_id = ? WHERE id = ?`).run(machB.id, workerB.id);

      db.prepare(`
        INSERT INTO machine_assignments (id, machine_id, worker_id, order_id, active, assigned_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(uuid(), machA.id, workerA.id, orderId, now);

      db.prepare(`
        INSERT INTO machine_assignments (id, machine_id, worker_id, order_id, active, assigned_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(uuid(), machB.id, workerB.id, orderId, now);

      // 3. If there is an affected order, split into dual parallel tasks
      if (orderId) {
        db.prepare(`
          UPDATE production_orders SET machine_id = ?, status = 'IN_PROGRESS', updated_at = ? WHERE id = ?
        `).run(machA.id, now, orderId);

        const order = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(orderId) as any;
        const pName = order?.product_name || 'Component Subassembly';

        db.prepare(`
          UPDATE production_tasks SET status = 'REASSIGNED', updated_at = ?
          WHERE order_id = ? AND status = 'IN_PROGRESS'
        `).run(now, orderId);

        db.prepare(`
          INSERT INTO production_tasks (id, order_id, worker_id, machine_id, title, target_qty, completed_qty, status, deadline, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, 'IN_PROGRESS', ?, ?)
        `).run(uuid(), orderId, workerA.id, machA.id, `${pName} [Stream A - Lead Batch]`, streamA.allocatedUnits || 74, order?.deadline || now, now);

        db.prepare(`
          INSERT INTO production_tasks (id, order_id, worker_id, machine_id, title, target_qty, completed_qty, status, deadline, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, 'IN_PROGRESS', ?, ?)
        `).run(uuid(), orderId, workerB.id, machB.id, `${pName} [Stream B - Parallel Batch]`, streamB.allocatedUnits || 54, order?.deadline || now, now);
      }

      // 4. Update recovery plan state
      const liveAfter = captureCurrentMetrics();
      db.prepare(`
        UPDATE recovery_plans
        SET status = 'APPROVED', approved_by_id = ?, decided_at = ?, after_metrics_json = ?
        WHERE id = ?
      `).run(req.user!.id, now, JSON.stringify(liveAfter), planId);

      // 5. Notify both workers
      createNotification(
        workerA.uid,
        'RECOVERY',
        `Dual-Stream Reassignment Approved (${plan.plan_code})`,
        `Assigned as Stream A lead on ${machA.machine_code} (${streamA.allocatedUnits} units) to eliminate line delay.`,
        '/worker/dashboard'
      );
      createNotification(
        workerB.uid,
        'RECOVERY',
        `Dual-Stream Reassignment Approved (${plan.plan_code})`,
        `Assigned as Stream B parallel on ${machB.machine_code} (${streamB.allocatedUnits} units) to eliminate line delay.`,
        '/worker/dashboard'
      );

      createAuditLog(
        req.user!.id,
        'RECOVERY_COMBINED_APPROVED',
        'RECOVERY_PLAN',
        planId,
        `Approved Dual-Stream Parallel Plan ${plan.plan_code}: Stream A ${workerA.full_name} (${machA.machine_code}), Stream B ${workerB.full_name} (${machB.machine_code})`
      );
    });

    tx();
    return res.json({
      message: `Dual-Stream Parallel Recovery Plan executed. Split production initiated across ${machA.machine_code} (${workerA.full_name}, ${streamA.allocatedUnits} units) and ${machB.machine_code} (${workerB.full_name}, ${streamB.allocatedUnits} units).`,
    });
  }

  let rec = recommendationId
    ? (db.prepare('SELECT * FROM recovery_recommendations WHERE id = ? AND plan_id = ?').get(recommendationId, planId) as any)
    : (db.prepare('SELECT * FROM recovery_recommendations WHERE plan_id = ? ORDER BY total_normalized_score DESC LIMIT 1').get(planId) as any);

  if (!rec) {
    return res.status(400).json({ error: 'No eligible recommendation found in this plan.' });
  }

  const targetMachineId = customTargetMachineId || rec.target_machine_id;
  const targetWorkerId = customWorkerId || rec.worker_id;
  const isModified = Boolean(customTargetMachineId || customWorkerId);

  // RE-VALIDATE HARD CONSTRAINTS INSIDE TRANSACTION BEFORE COMMITTING
  const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(targetMachineId) as any;
  const worker = db.prepare('SELECT w.*, u.id as uid, u.full_name FROM workers w JOIN users u ON w.user_id = u.id WHERE w.id = ?').get(targetWorkerId) as any;

  if (!machine || machine.status === 'FAULT' || machine.status === 'MAINTENANCE') {
    db.prepare(`UPDATE recovery_plans SET status = 'STALE' WHERE id = ?`).run(planId);
    return res.status(409).json({
      error: `Stale plan rejected: Target machine ${machine?.machine_code || ''} is currently in ${machine?.status || 'unavailable'} state. Please recalculate recovery options.`,
    });
  }

  if (!worker || worker.availability === 'ABSENT') {
    db.prepare(`UPDATE recovery_plans SET status = 'STALE' WHERE id = ?`).run(planId);
    return res.status(409).json({
      error: `Stale plan rejected: Selected worker ${worker?.full_name || ''} is no longer available. Please recalculate recovery options.`,
    });
  }

  // Verify skill constraint even on modified selection
  const hasSkill = db.prepare(`
    SELECT ws.id FROM worker_skills ws JOIN skills s ON ws.skill_id = s.id
    WHERE ws.worker_id = ? AND s.code = ?
  `).get(targetWorkerId, machine.required_skill_code);

  if (!hasSkill) {
    return res.status(400).json({
      error: `Eligibility violation blocked: ${worker.full_name} does not hold required skill ${machine.required_skill_code} for ${machine.machine_code}.`,
    });
  }

  const tx = db.transaction(() => {
    // 1. Activate backup machine
    const prevStatus = machine.status;
    db.prepare(`UPDATE machines SET status = 'OPERATING', utilization_pct = 86 WHERE id = ?`).run(targetMachineId);
    if (prevStatus !== 'OPERATING') {
      db.prepare(`
        INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at)
        VALUES (?, ?, ?, 'OPERATING', ?, ?, ?)
      `).run(uuid(), targetMachineId, prevStatus, req.user!.id, `Activated via Recovery Plan ${plan.plan_code}`, now);
    }

    // 2. Reallocate worker
    db.prepare(`UPDATE workers SET availability = 'ASSIGNED', assigned_machine_id = ? WHERE id = ?`).run(targetMachineId, targetWorkerId);
    db.prepare(`
      INSERT INTO machine_assignments (id, machine_id, worker_id, order_id, active, assigned_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(uuid(), targetMachineId, targetWorkerId, rec.order_id || null, now);

    // 3. Reassign affected production order & tasks
    if (rec.order_id) {
      db.prepare(`
        UPDATE production_orders SET machine_id = ?, status = 'IN_PROGRESS', updated_at = ? WHERE id = ?
      `).run(targetMachineId, now, rec.order_id);

      db.prepare(`
        UPDATE production_tasks SET machine_id = ?, worker_id = ?, status = 'IN_PROGRESS', updated_at = ?
        WHERE order_id = ? AND status != 'COMPLETED'
      `).run(targetMachineId, targetWorkerId, now, rec.order_id);
    }

    // 4. Mark plan approved/modified & capture post-execution snapshot
    const liveAfter = captureCurrentMetrics();
    db.prepare(`
      UPDATE recovery_plans
      SET status = ?, approved_by_id = ?, decided_at = ?, after_metrics_json = ?
      WHERE id = ?
    `).run(isModified ? 'MODIFIED' : 'APPROVED', req.user!.id, now, JSON.stringify(liveAfter), planId);

    db.prepare(`UPDATE recovery_recommendations SET selected = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE plan_id = ?`).run(rec.id, planId);

    // 5. Notify worker & create audit record
    createNotification(
      worker.uid,
      'RECOVERY',
      `Recovery Reassignment Approved (${plan.plan_code})`,
      `Manager ${req.user!.fullName} reassigned you to ${machine.machine_code} (${machine.name}) to resume production continuity.`,
      '/worker/dashboard'
    );

    createAuditLog(
      req.user!.id,
      'RECOVERY_APPROVED',
      'RECOVERY_PLAN',
      planId,
      `Approved ${plan.plan_code}: Reallocated ${worker.full_name} to ${machine.machine_code}`
    );
  });

  tx();
  res.json({
    message: `Recovery Plan ${plan.plan_code} executed. ${worker.full_name} & ${machine.machine_code} are now operating on recovered order.`,
  });
});

app.post('/api/recovery/reject', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { planId, reason } = req.body || {};
  if (!planId) return res.status(400).json({ error: 'Plan ID required.' });
  const plan = db.prepare('SELECT * FROM recovery_plans WHERE id = ?').get(planId) as any;
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });

  db.prepare(`UPDATE recovery_plans SET status = 'REJECTED', approved_by_id = ?, decided_at = ? WHERE id = ?`).run(
    req.user!.id,
    new Date().toISOString(),
    planId
  );
  createAuditLog(req.user!.id, 'RECOVERY_REJECTED', 'RECOVERY_PLAN', planId, `Rejected ${plan.plan_code}: ${reason || 'Manual hold preferred'}`);
  res.json({ message: `Recovery plan ${plan.plan_code} rejected.` });
});

app.get('/api/recovery/history', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const plans = db.prepare(`
    SELECT rp.*, u.full_name as approved_by_name
    FROM recovery_plans rp
    LEFT JOIN users u ON rp.approved_by_id = u.id
    ORDER BY rp.created_at DESC
    LIMIT 20
  `).all() as any[];

  const getRecs = db.prepare(`
    SELECT rr.*, m.machine_code as target_machine_code, m.name as target_machine_name,
           u.full_name as worker_name, po.order_code
    FROM recovery_recommendations rr
    JOIN machines m ON rr.target_machine_id = m.id
    JOIN workers w ON rr.worker_id = w.id
    JOIN users u ON w.user_id = u.id
    LEFT JOIN production_orders po ON rr.order_id = po.id
    WHERE rr.plan_id = ?
    ORDER BY rr.total_normalized_score DESC
  `);

  res.json({
    history: plans.map((p) => ({
      ...p,
      weights: JSON.parse(p.weights_json),
      beforeMetrics: JSON.parse(p.before_metrics_json),
      afterMetrics: JSON.parse(p.after_metrics_json),
      recommendations: getRecs.all(p.id),
    })),
  });
});

// ============================================================================
// 10. FACTORY SCENARIO SIMULATOR (/api/simulations) - Non-destructive snapshots
// ============================================================================
app.post('/api/simulations', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { scenarioType, name, parameters } = req.body || {};
  if (!scenarioType) return res.status(400).json({ error: 'Scenario type is required.' });

  const baseline = captureCurrentMetrics();
  let eventType = 'MACHINE_FAULT';
  let triggerId = '';
  let assumptions = '';
  let simulatedDelayHrs = 0;

  if (scenarioType === 'MACHINE_FAILURE') {
    eventType = 'MACHINE_FAULT';
    triggerId = parameters?.machineId || '';
    const downHrs = Number(parameters?.downtimeHrs || 6);
    const failType = parameters?.failureType || 'Spindle Servo Thermal Overload';
    assumptions = `Simulated non-destructive snapshot: ${failType} for ${downHrs}h on selected machine. Live database records remain untouched.`;
    simulatedDelayHrs = Number((downHrs * 0.65).toFixed(1));
  } else if (scenarioType === 'WORKER_ABSENCE') {
    eventType = 'WORKER_ABSENCE';
    triggerId = parameters?.workerId || '';
    assumptions = `Simulated unplanned single-shift absence of selected operator. Evaluates certified cross-trained standby pool.`;
    simulatedDelayHrs = 1.2;
  } else if (scenarioType === 'DEMAND_INCREASE') {
    eventType = 'DEMAND_SPIKE';
    triggerId = parameters?.orderId || '';
    const extraUnits = Number(parameters?.additionalUnits || 250);
    assumptions = `Simulated +${extraUnits} unit surge order target against current ${baseline.hourlyProductionCapacity} u/hr operating plant capacity.`;
    simulatedDelayHrs = Number((extraUnits / Math.max(25, baseline.hourlyProductionCapacity * 0.35)).toFixed(1));
  } else if (scenarioType === 'SCHEDULED_MAINTENANCE') {
    eventType = 'MACHINE_MAINTENANCE';
    triggerId = parameters?.machineId || '';
    const maintHrs = Number(parameters?.durationHrs || 4);
    assumptions = `Planned ${maintHrs}h preventive maintenance window evaluated prior to locking machine schedule.`;
    simulatedDelayHrs = Number((maintHrs * 0.4).toFixed(1));
  } else {
    eventType = 'PRODUCTION_SHORTAGE';
    triggerId = parameters?.orderId || '';
    assumptions = `Simulated delayed order catch-up evaluation using idle compatible machine bays.`;
    simulatedDelayHrs = 2.4;
  }

  // Run engine with persistProposal = false so live recovery_plans are NOT mutated!
  const analysis = analyzeDisruptionAndRecommend({
    eventType,
    triggerEntityId: triggerId,
    persistProposal: false,
  });

  const scenarioId = uuid();
  const resultId = uuid();
  const now = new Date().toISOString();

  const simAfter = {
    ...analysis.afterMetrics,
    estimatedProductionDelayHrs:
      analysis.recommendations.length > 0
        ? Number((simulatedDelayHrs * 0.35).toFixed(1))
        : simulatedDelayHrs,
  };

  db.prepare(`
    INSERT INTO simulation_scenarios (id, created_by_id, scenario_type, name, parameters_json, assumptions, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    scenarioId,
    req.user!.id,
    scenarioType,
    name || `${scenarioType.replace('_', ' ')} Simulation`,
    JSON.stringify(parameters || {}),
    assumptions,
    now
  );

  db.prepare(`
    INSERT INTO simulation_results (id, scenario_id, metrics_before_json, metrics_after_json, recommendations_json, estimated_delay_hrs, converted_plan_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    resultId,
    scenarioId,
    JSON.stringify(baseline),
    JSON.stringify(simAfter),
    JSON.stringify(analysis.recommendations),
    simAfter.estimatedProductionDelayHrs,
    now
  );

  res.status(201).json({
    scenarioId,
    resultId,
    scenarioType,
    name: name || `${scenarioType} Simulation`,
    assumptions,
    beforeMetrics: baseline,
    afterMetrics: simAfter,
    unmitigatedDelayHrs: simulatedDelayHrs,
    mitigatedDelayHrs: simAfter.estimatedProductionDelayHrs,
    impactedMachine: analysis.impactedMachine,
    impactedOrders: analysis.impactedOrders,
    impactedWorkers: analysis.impactedWorkers,
    recommendations: analysis.recommendations,
  });
});

app.get('/api/simulations', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const rows = db.prepare(`
    SELECT ss.*, sr.id as result_id, sr.metrics_before_json, sr.metrics_after_json, sr.recommendations_json,
           sr.estimated_delay_hrs, sr.converted_plan_id
    FROM simulation_scenarios ss
    JOIN simulation_results sr ON sr.scenario_id = ss.id
    ORDER BY ss.created_at DESC
    LIMIT 15
  `).all() as any[];

  res.json({
    simulations: rows.map((r) => ({
      id: r.id,
      resultId: r.result_id,
      scenarioType: r.scenario_type,
      name: r.name,
      assumptions: r.assumptions,
      parameters: JSON.parse(r.parameters_json),
      beforeMetrics: JSON.parse(r.metrics_before_json),
      afterMetrics: JSON.parse(r.metrics_after_json),
      recommendations: JSON.parse(r.recommendations_json),
      estimatedDelayHrs: r.estimated_delay_hrs,
      convertedPlanId: r.converted_plan_id,
      createdAt: r.created_at,
    })),
  });
});

app.post('/api/simulations/:id/convert', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const sim = db.prepare('SELECT * FROM simulation_scenarios WHERE id = ?').get(req.params.id) as any;
  if (!sim) return res.status(404).json({ error: 'Simulation scenario not found.' });
  const params = JSON.parse(sim.parameters_json);
  const triggerId = params.machineId || params.workerId || params.orderId || '';
  const eventMap: Record<string, string> = {
    MACHINE_FAILURE: 'MACHINE_FAULT',
    WORKER_ABSENCE: 'WORKER_ABSENCE',
    DEMAND_INCREASE: 'DEMAND_SPIKE',
    SCHEDULED_MAINTENANCE: 'MACHINE_MAINTENANCE',
    PRODUCTION_DELAY: 'PRODUCTION_SHORTAGE',
  };

  const proposal = analyzeDisruptionAndRecommend({
    eventType: eventMap[sim.scenario_type] || 'MACHINE_FAULT',
    triggerEntityId: triggerId,
    persistProposal: true,
  });

  if (proposal.planId) {
    db.prepare('UPDATE simulation_results SET converted_plan_id = ? WHERE scenario_id = ?').run(proposal.planId, sim.id);
    createAuditLog(req.user!.id, 'SIMULATION_CONVERTED', 'RECOVERY_PLAN', proposal.planId, `Converted simulation "${sim.name}" into formal recovery proposal ${proposal.planCode}`);
  }

  res.json({
    planId: proposal.planId,
    planCode: proposal.planCode,
    message: proposal.planCode
      ? `Simulation converted to live Recovery Proposal ${proposal.planCode}. Review & approve in Recovery Engine.`
      : 'Simulation evaluated; no eligible recovery reallocation needed.',
  });
});

// ============================================================================
// 11. ANALYTICS & REPORTING (/api/analytics/*)
// ============================================================================
app.get('/api/analytics/overview', requireAuth, requireRoles('MANAGER', 'ADMIN', 'TECHNICIAN'), (req, res) => {
  const { departmentId = '' } = req.query as Record<string, string>;

  const workers = db.prepare(`SELECT * FROM workers WHERE (? = '' OR department_id = ?)`).all(departmentId, departmentId) as any[];
  const machines = db.prepare(`SELECT * FROM machines WHERE (? = '' OR department_id = ?)`).all(departmentId, departmentId) as any[];
  const orders = db.prepare(`SELECT * FROM production_orders WHERE (? = '' OR department_id = ?)`).all(departmentId, departmentId) as any[];
  const safety = db.prepare(`SELECT * FROM safety_incidents WHERE (? = '' OR department_id = ?)`).all(departmentId, departmentId) as any[];
  const maint = db.prepare(`
    SELECT mr.* FROM maintenance_requests mr
    JOIN machines m ON mr.machine_id = m.id
    WHERE (? = '' OR m.department_id = ?)
  `).all(departmentId, departmentId) as any[];

  const totalTarget = orders.reduce((s, o) => s + o.target_qty, 0);
  const totalProduced = orders.reduce((s, o) => s + o.produced_qty, 0);

  const productionTrend = db.prepare(`
    SELECT log_date as date, SUM(output_delta) as output, SUM(downtime_mins) as downtime
    FROM production_logs
    GROUP BY log_date
    ORDER BY log_date ASC
    LIMIT 10
  `).all();

  const deptPerformance = db.prepare(`
    SELECT d.id, d.name, d.target_efficiency_pct,
           COALESCE((SELECT AVG(m.utilization_pct) FROM machines m WHERE m.department_id = d.id), 0) as avg_machine_util,
           (SELECT COUNT(*) FROM workers w WHERE w.department_id = d.id AND w.availability != 'ABSENT') as active_workers,
           COALESCE((SELECT SUM(po.produced_qty) FROM production_orders po WHERE po.department_id = d.id), 0) as produced_units,
           COALESCE((SELECT SUM(po.target_qty) FROM production_orders po WHERE po.department_id = d.id), 1) as target_units
    FROM departments d
    ORDER BY d.name ASC
  `).all() as any[];

  const skillDistribution = db.prepare(`
    SELECT s.code, s.name, COUNT(ws.id) as worker_count
    FROM skills s
    LEFT JOIN worker_skills ws ON ws.skill_id = s.id
    GROUP BY s.id
  `).all();

  const safetyByCategory = db.prepare(`
    SELECT category, severity, COUNT(*) as count
    FROM safety_incidents
    GROUP BY category, severity
  `).all();

  const alerts = db.prepare(`
    SELECT mr.id, mr.request_code as code, mr.priority as severity, 'MACHINE_FAULT' as type,
           m.machine_code || ' — ' || mr.fault_category as title, mr.description, mr.created_at
    FROM maintenance_requests mr
    JOIN machines m ON mr.machine_id = m.id
    WHERE mr.status != 'COMPLETED'
    UNION ALL
    SELECT si.id, si.incident_code as code, si.severity, 'SAFETY' as type,
           si.category as title, si.description, si.created_at
    FROM safety_incidents si
    WHERE si.status != 'RESOLVED'
    ORDER BY created_at DESC
    LIMIT 8
  `).all();

  const schedulesOverdue = (db.prepare(`SELECT COUNT(*) as c FROM maintenance_schedules WHERE status = 'OVERDUE'`).get() as any).c;
  const schedulesUpcoming = (db.prepare(`SELECT COUNT(*) as c FROM maintenance_schedules WHERE status = 'SCHEDULED'`).get() as any).c;

  res.json({
    workforce: {
      total: workers.length,
      present: workers.filter((w) => w.availability !== 'ABSENT').length,
      available: workers.filter((w) => w.availability === 'AVAILABLE').length,
      assigned: workers.filter((w) => w.availability === 'ASSIGNED').length,
      absent: workers.filter((w) => w.availability === 'ABSENT').length,
    },
    machines: {
      total: machines.length,
      operating: machines.filter((m) => m.status === 'OPERATING').length,
      idle: machines.filter((m) => m.status === 'IDLE').length,
      fault: machines.filter((m) => m.status === 'FAULT').length,
      maintenance: machines.filter((m) => m.status === 'MAINTENANCE').length,
      list: machines,
    },
    production: {
      activeOrders: orders.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'NOT_STARTED').length,
      completedOrders: orders.filter((o) => o.status === 'COMPLETED').length,
      delayedOrders: orders.filter((o) => o.status === 'DELAYED' || o.status === 'ON_HOLD').length,
      achievementPct: totalTarget > 0 ? Math.round((totalProduced / totalTarget) * 100) : 0,
      totalTarget,
      totalProduced,
    },
    safety: {
      activeIncidents: safety.filter((s) => s.status !== 'RESOLVED').length,
      highPriority: safety.filter((s) => s.status !== 'RESOLVED' && (s.severity === 'HIGH' || s.severity === 'CRITICAL')).length,
      resolvedIncidents: safety.filter((s) => s.status === 'RESOLVED').length,
      pendingActions: (db.prepare(`SELECT COUNT(*) as c FROM safety_actions WHERE status = 'PENDING'`).get() as any).c,
      byCategory: safetyByCategory,
    },
    maintenance: {
      pendingRequests: maint.filter((m) => m.status !== 'COMPLETED').length,
      completedRequests: maint.filter((m) => m.status === 'COMPLETED').length,
      scheduledCount: schedulesUpcoming,
      overdueCount: schedulesOverdue,
    },
    productionTrend,
    deptPerformance: deptPerformance.map((d) => ({
      ...d,
      avg_machine_util: Math.round(d.avg_machine_util),
      achievementPct: d.target_units > 0 ? Math.round((d.produced_units / d.target_units) * 100) : 0,
    })),
    skillDistribution,
    alerts,
  });
});

// Dedicated Analytics sub-endpoints per prompt specification
app.get('/api/analytics/production', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const logs = db.prepare(`SELECT * FROM production_logs ORDER BY log_date ASC`).all();
  const orders = db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC`).all();
  res.json({ logs, orders });
});

app.get('/api/analytics/workforce', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const attendance = db.prepare(`SELECT status, COUNT(*) as count FROM attendance GROUP BY status`).all();
  const shifts = db.prepare(`SELECT name, COUNT(*) as count FROM shifts GROUP BY name`).all();
  res.json({ attendance, shifts });
});

app.get('/api/analytics/machines', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const machines = db.prepare(`
    SELECT machine_code, name, status, utilization_pct, operating_hours_total, idle_hours_total, fault_hours_total
    FROM machines ORDER BY machine_code ASC
  `).all();
  res.json({ machines });
});

app.get('/api/analytics/maintenance', requireAuth, requireRoles('MANAGER', 'ADMIN', 'TECHNICIAN'), (_req, res) => {
  const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM maintenance_requests GROUP BY status`).all();
  const byCategory = db.prepare(`SELECT fault_category, COUNT(*) as count FROM maintenance_requests GROUP BY fault_category`).all();
  res.json({ byStatus, byCategory });
});

app.get('/api/analytics/safety', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const bySeverity = db.prepare(`SELECT severity, COUNT(*) as count FROM safety_incidents GROUP BY severity`).all();
  const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM safety_incidents GROUP BY status`).all();
  res.json({ bySeverity, byStatus });
});

// ============================================================================
// 12. SHARED NOTIFICATIONS (/api/notifications)
// ============================================================================
app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40
  `).all(req.user!.id);
  const unreadCount = (db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`).get(req.user!.id) as any).c;
  res.json({ notifications, unreadCount });
});

app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
  if (req.params.id === 'all') {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user!.id);
    return res.json({ message: 'All notifications marked as read.' });
  }
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.user!.id);
  res.json({ message: 'Notification marked as read.' });
});

// ============================================================================
// 13. ADVANCED ENTERPRISE EXTENSIONS (COMMAND CENTER, BOTTLENECKS, SHIFT HANDOVER,
//     QUALITY INSPECTION, PRIORITY ESCALATION, MULTI-SCENARIO, DATA MGMT, DEMO ENV)
// ============================================================================

// --- 13.0 FACTORY HEALTH INDICATOR (HEALTHY | ATTENTION_REQUIRED | CRITICAL) ---
app.get('/api/factory/health', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const faultMachines = db.prepare(`SELECT m.machine_code, m.name, d.name as dept FROM machines m JOIN departments d ON m.department_id = d.id WHERE m.status IN ('FAULT', 'MAINTENANCE', 'VERIFICATION_REQUIRED')`).all() as any[];
  const delayedOrders = db.prepare(`SELECT po.order_code, po.product_name, d.name as dept FROM production_orders po JOIN departments d ON po.department_id = d.id WHERE po.status = 'DELAYED'`).all() as any[];
  const criticalSafety = db.prepare(`SELECT si.incident_code, si.category, d.name as dept FROM safety_incidents si JOIN departments d ON si.department_id = d.id WHERE si.severity = 'CRITICAL' AND si.status != 'RESOLVED'`).all() as any[];
  const overdueMaint = db.prepare(`SELECT ms.title, m.machine_code, d.name as dept FROM maintenance_schedules ms JOIN machines m ON ms.machine_id = m.id JOIN departments d ON m.department_id = d.id WHERE ms.status = 'OVERDUE'`).all() as any[];

  const reasons: { category: string; description: string; affectedDept: string; link: string }[] = [];

  faultMachines.forEach((m) => {
    reasons.push({ category: 'MACHINE_OUTAGE', description: `Machine ${m.machine_code} (${m.name}) is unavailable or awaiting verification.`, affectedDept: m.dept, link: '/manager/dashboard?tab=machines' });
  });
  delayedOrders.forEach((o) => {
    reasons.push({ category: 'PRODUCTION_DELAY', description: `Order ${o.order_code} (${o.product_name}) deadline is delayed.`, affectedDept: o.dept, link: '/manager/dashboard?tab=production' });
  });
  criticalSafety.forEach((s) => {
    reasons.push({ category: 'SAFETY_HAZARD', description: `Critical safety incident ${s.incident_code} (${s.category}) requires resolution.`, affectedDept: s.dept, link: '/manager/dashboard?tab=safety' });
  });
  overdueMaint.forEach((m) => {
    reasons.push({ category: 'OVERDUE_MAINTENANCE', description: `Preventive service '${m.title}' on ${m.machine_code} is overdue.`, affectedDept: m.dept, link: '/manager/dashboard?tab=maintenance' });
  });

  let status: 'HEALTHY' | 'ATTENTION_REQUIRED' | 'CRITICAL' = 'HEALTHY';
  if (criticalSafety.length > 0 || faultMachines.length > 2 || delayedOrders.length > 2) {
    status = 'CRITICAL';
  } else if (reasons.length > 0) {
    status = 'ATTENTION_REQUIRED';
  }

  const explanation = status === 'HEALTHY'
    ? 'All shop floor bays operating nominal. Zero open critical safety hazards or machine outages.'
    : status === 'ATTENTION_REQUIRED'
    ? `${reasons.length} operational constraints detected across plant lines. Prompt intervention recommended.`
    : `Critical plant disruption threshold reached (${criticalSafety.length} critical safety, ${faultMachines.length} machine outages). Immediate recovery required.`;

  res.json({
    status,
    explanation,
    reasonsCount: reasons.length,
    reasons,
    recommendedAction: status === 'CRITICAL' ? 'Engage Intelligent Recovery Engine immediately and verify safety hazards.' : status === 'ATTENTION_REQUIRED' ? 'Review open machine fault queue and rebalance shift rosters.' : 'Maintain standard operational monitoring.'
  });
});

// --- 13.01 MAINTENANCE VERIFICATION WORKFLOW ---
app.post('/api/maintenance/requests/:id/verify', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { id } = req.params;
  const { action, verificationNotes, restoreMachineStatus } = req.body || {};

  const request = db.prepare(`
    SELECT mr.*, m.machine_code, m.id as machine_id FROM maintenance_requests mr
    JOIN machines m ON mr.machine_id = m.id WHERE mr.id = ?
  `).get(id) as any;

  if (!request) return res.status(404).json({ error: 'Maintenance request not found.' });

  const now = new Date().toISOString();
  const isApprove = action === 'APPROVE';

  const tx = db.transaction(() => {
    if (isApprove) {
      const nextMachineState = restoreMachineStatus || 'OPERATIONAL';
      db.prepare(`UPDATE maintenance_requests SET status = 'COMPLETED', repair_notes = COALESCE(repair_notes, '') || ?, completed_at = ? WHERE id = ?`).run(`\n[Manager Verification Approved]: ${verificationNotes || 'Verified nominal test run.'}`, now, id);
      db.prepare(`UPDATE machines SET status = ?, utilization_pct = 80, last_serviced_date = ? WHERE id = ?`).run(nextMachineState, now.slice(0, 10), request.machine_id);
      db.prepare(`INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at) VALUES (?, ?, 'VERIFICATION_REQUIRED', ?, ?, ?, ?)`).run(uuid(), request.machine_id, nextMachineState, req.user!.id, `Manager ${req.user!.fullName} verified and approved repair completion.`, now);
    } else {
      db.prepare(`UPDATE maintenance_requests SET status = 'IN_PROGRESS', repair_notes = COALESCE(repair_notes, '') || ? WHERE id = ?`).run(`\n[Manager Verification Rejected]: ${verificationNotes || 'Re-calibration required.'}`, id);
      db.prepare(`UPDATE machines SET status = 'MAINTENANCE' WHERE id = ?`).run(request.machine_id);
      db.prepare(`INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at) VALUES (?, ?, 'VERIFICATION_REQUIRED', 'MAINTENANCE', ?, ?, ?)`).run(uuid(), request.machine_id, req.user!.id, `Manager ${req.user!.fullName} rejected verification: returned to technician queue.`, now);
    }
  });
  tx();

  createAuditLog(req.user!.id, isApprove ? 'MAINTENANCE_VERIFIED' : 'MAINTENANCE_REJECTED', 'MAINTENANCE_REQUEST', id, `${isApprove ? 'Approved' : 'Rejected'} repair verification for ${request.machine_code}`);
  res.json({ message: isApprove ? `Repair for ${request.machine_code} verified & restored to OPERATIONAL.` : `Verification rejected for ${request.machine_code}. Returned to technician queue.` });
});

// --- 13.02 SAFETY INCIDENT ESCALATION & RESOLUTION ---
app.post('/api/safety/incidents/:id/acknowledge', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { id } = req.params;
  db.prepare(`UPDATE safety_incidents SET status = 'ACTION_ASSIGNED' WHERE id = ?`).run(id);
  createAuditLog(req.user!.id, 'SAFETY_ACKNOWLEDGED', 'SAFETY_INCIDENT', id, `Safety incident ${id} acknowledged by ${req.user!.fullName}`);
  res.json({ message: 'Safety incident acknowledged and escalated.' });
});

app.post('/api/safety/incidents/:id/resolve', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { id } = req.params;
  const { resolutionNotes } = req.body || {};
  const now = new Date().toISOString();
  db.prepare(`UPDATE safety_incidents SET status = 'RESOLVED', resolved_at = ? WHERE id = ?`).run(now, id);
  createAuditLog(req.user!.id, 'SAFETY_RESOLVED', 'SAFETY_INCIDENT', id, `Safety incident ${id} marked resolved: ${resolutionNotes || 'Corrective action verified.'}`);
  res.json({ message: 'Safety incident formally resolved and audit logged.' });
});

// --- 13.03 ACTUAL VS TARGET FACTORY INTELLIGENCE ---
app.get('/api/analytics/actual-vs-target', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const orders = db.prepare(`SELECT SUM(target_qty) as tgt, SUM(produced_qty) as prod FROM production_orders`).get() as any;
  const quality = db.prepare(`SELECT SUM(inspected_qty) as ins, SUM(accepted_qty) as acc, SUM(rejected_qty) as rej FROM quality_inspections`).get() as any;
  const machines = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='OPERATING' THEN 1 ELSE 0 END) as operating, SUM(CASE WHEN status='FAULT' THEN 1 ELSE 0 END) as fault FROM machines`).get() as any;
  const workforce = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN availability!='ABSENT' THEN 1 ELSE 0 END) as active FROM workers`).get() as any;
  const maintenance = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed FROM maintenance_requests`).get() as any;

  const targetProd = orders?.tgt || 1000;
  const actualProd = orders?.prod || 0;
  const prodPct = Math.round((actualProd / Math.max(1, targetProd)) * 100);

  const totalIns = quality?.ins || 1;
  const totalAcc = quality?.acc || 0;
  const qualityYield = Math.round((totalAcc / Math.max(1, totalIns)) * 100);

  res.json({
    production: { target: targetProd, actual: actualProd, achievementPct: prodPct, trend: prodPct >= 85 ? 'IMPROVING' : 'ATTENTION_NEEDED' },
    quality: { inspected: totalIns, accepted: totalAcc, rejected: quality?.rej || 0, yieldPct: qualityYield, trend: qualityYield >= 95 ? 'HEALTHY' : 'ATTENTION_NEEDED' },
    machines: { total: machines?.total || 0, operating: machines?.operating || 0, fault: machines?.fault || 0, utilizationPct: Math.round(((machines?.operating || 0) / Math.max(1, machines?.total || 1)) * 100) },
    workforce: { total: workforce?.total || 0, active: workforce?.active || 0, availabilityPct: Math.round(((workforce?.active || 0) / Math.max(1, workforce?.total || 1)) * 100) },
    maintenance: { total: maintenance?.total || 0, completed: maintenance?.completed || 0, completionPct: Math.round(((maintenance?.completed || 0) / Math.max(1, maintenance?.total || 1)) * 100) }
  });
});

// --- 13.04 GLOBAL SEARCH ---
app.get('/api/global-search', requireAuth, (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  if (!query || query.length < 2) return res.json({ results: [] });

  const q = `%${query}%`;
  const workers = db.prepare(`
    SELECT w.id, u.full_name as title, u.employee_code as subtitle, 'WORKER' as category, '/manager/dashboard?tab=workforce' as link
    FROM workers w JOIN users u ON w.user_id = u.id
    WHERE LOWER(u.full_name) LIKE ? OR LOWER(u.employee_code) LIKE ? OR LOWER(w.designation) LIKE ? LIMIT 5
  `).all(q, q, q);

  const machines = db.prepare(`
    SELECT id, name as title, machine_code as subtitle, 'MACHINE' as category, '/manager/dashboard?tab=machines' as link
    FROM machines WHERE LOWER(name) LIKE ? OR LOWER(machine_code) LIKE ? OR LOWER(machine_type) LIKE ? LIMIT 5
  `).all(q, q, q);

  const orders = db.prepare(`
    SELECT id, product_name as title, order_code as subtitle, 'PRODUCTION' as category, '/manager/dashboard?tab=production' as link
    FROM production_orders WHERE LOWER(product_name) LIKE ? OR LOWER(order_code) LIKE ? LIMIT 5
  `).all(q, q);

  const maintenance = db.prepare(`
    SELECT id, fault_category as title, request_code as subtitle, 'MAINTENANCE' as category, '/manager/dashboard?tab=maintenance' as link
    FROM maintenance_requests WHERE LOWER(fault_category) LIKE ? OR LOWER(request_code) LIKE ? OR LOWER(description) LIKE ? LIMIT 5
  `).all(q, q, q);

  const safety = db.prepare(`
    SELECT id, category as title, incident_code as subtitle, 'SAFETY' as category, '/manager/dashboard?tab=safety' as link
    FROM safety_incidents WHERE LOWER(category) LIKE ? OR LOWER(incident_code) LIKE ? OR LOWER(description) LIKE ? LIMIT 5
  `).all(q, q, q);

  res.json({ results: [...workers, ...machines, ...orders, ...maintenance, ...safety] });
});

// --- 13.1 FACTORY OPERATIONAL COMMAND CENTER ---
app.get('/api/command-center/overview', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const activeWorkers = (db.prepare(`SELECT COUNT(*) as c FROM workers WHERE availability = 'AVAILABLE' OR availability = 'ASSIGNED'`).get() as any).c;
  const totalWorkers = (db.prepare(`SELECT COUNT(*) as c FROM workers`).get() as any).c;
  const operatingMachines = (db.prepare(`SELECT COUNT(*) as c FROM machines WHERE status = 'OPERATING'`).get() as any).c;
  const faultMachines = (db.prepare(`SELECT COUNT(*) as c FROM machines WHERE status = 'FAULT'`).get() as any).c;
  const totalMachines = (db.prepare(`SELECT COUNT(*) as c FROM machines`).get() as any).c;
  const delayedOrders = (db.prepare(`
    SELECT COUNT(*) as c FROM production_orders 
    WHERE status IN ('PENDING', 'IN_PROGRESS') AND datetime(deadline) < datetime('now')
  `).get() as any).c;
  const criticalSafety = (db.prepare(`SELECT COUNT(*) as c FROM safety_incidents WHERE severity = 'CRITICAL' AND status != 'RESOLVED'`).get() as any).c;
  const pendingMaint = (db.prepare(`SELECT COUNT(*) as c FROM maintenance_requests WHERE status != 'COMPLETED'`).get() as any).c;
  const activeRecoveryPlans = (db.prepare(`SELECT COUNT(*) as c FROM recovery_plans WHERE status IN ('PROPOSED', 'APPROVED', 'MODIFIED')`).get() as any).c;
  const openCorrectiveActions = (db.prepare(`SELECT COUNT(*) as c FROM safety_actions WHERE status = 'PENDING'`).get() as any).c;

  // Transparent Factory Operational Health Score (0 - 100)
  // Components: Machine Availability (40%), Workforce Presence (25%), Safety Integrity (15%), Schedule Adherence (20%)
  const machineScore = totalMachines > 0 ? (operatingMachines / totalMachines) * 40 : 40;
  const workforceScore = totalWorkers > 0 ? (activeWorkers / totalWorkers) * 25 : 25;
  const safetyPenalty = criticalSafety * 10;
  const safetyScore = Math.max(0, 15 - safetyPenalty);
  const delayPenalty = delayedOrders * 5;
  const delayScore = Math.max(0, 20 - delayPenalty);
  const healthScore = Math.min(100, Math.max(0, Math.round(machineScore + workforceScore + safetyScore + delayScore)));

  const machinesSummary = db.prepare(`
    SELECT m.id, m.machine_code, m.name, m.status, m.utilization_pct, d.name as department_name, l.name as line_name
    FROM machines m
    JOIN departments d ON m.department_id = d.id
    LEFT JOIN production_lines l ON m.line_id = l.id
    ORDER BY m.status DESC, m.machine_code ASC
  `).all();

  const recentRecoveryPlans = db.prepare(`
    SELECT id, plan_code, event_type, status, summary, created_at
    FROM recovery_plans
    ORDER BY created_at DESC LIMIT 5
  `).all();

  res.json({
    healthScore,
    healthBreakdown: {
      machineScore: Math.round(machineScore),
      workforceScore: Math.round(workforceScore),
      safetyScore: Math.round(safetyScore),
      delayScore: Math.round(delayScore),
    },
    metrics: {
      activeWorkers,
      totalWorkers,
      operatingMachines,
      faultMachines,
      totalMachines,
      delayedOrders,
      criticalSafety,
      pendingMaint,
      activeRecoveryPlans,
      openCorrectiveActions,
    },
    machinesSummary,
    recentRecoveryPlans,
  });
});

app.get('/api/command-center/events', requireAuth, requireRoles('MANAGER', 'ADMIN', 'WORKER', 'TECHNICIAN'), (req, res) => {
  const { eventType, priority, status, search, limit = '50' } = req.query as Record<string, string>;
  let sql = `
    SELECT e.*, u.full_name as responsible_person_name, a.full_name as acknowledged_by_name
    FROM operational_events e
    LEFT JOIN users u ON e.responsible_person_id = u.id
    LEFT JOIN users a ON e.acknowledged_by_id = a.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (eventType && eventType !== 'ALL') {
    sql += ` AND e.event_type = ?`;
    params.push(eventType);
  }
  if (priority && priority !== 'ALL') {
    sql += ` AND e.priority = ?`;
    params.push(priority);
  }
  if (status && status !== 'ALL') {
    sql += ` AND e.status = ?`;
    params.push(status);
  }
  if (search) {
    sql += ` AND (e.event_code LIKE ? OR e.description LIKE ? OR e.entity_type LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  sql += ` ORDER BY e.created_at DESC LIMIT ?`;
  params.push(parseInt(limit, 10) || 50);

  const events = db.prepare(sql).all(...params);
  res.json({ events });
});

app.post('/api/command-center/events/:id/acknowledge', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const event = db.prepare(`SELECT * FROM operational_events WHERE id = ?`).get(req.params.id) as any;
  if (!event) return res.status(404).json({ error: 'Operational event not found.' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE operational_events
    SET status = 'ACKNOWLEDGED', acknowledged_by_id = ?, acknowledged_at = ?
    WHERE id = ?
  `).run(req.user!.id, now, req.params.id);

  createAuditLog(req.user!.id, 'ACKNOWLEDGE', 'OPERATIONAL_EVENT', req.params.id, `Acknowledged event ${event.event_code}: ${event.description}`);
  res.json({ message: 'Operational event acknowledged successfully.' });
});

app.post('/api/command-center/events', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { eventType, priority, description, entityType, entityId } = req.body;
  if (!eventType || !description || !priority) {
    return res.status(400).json({ error: 'Event type, priority, and description are required.' });
  }

  const id = createOperationalEvent({
    eventType,
    priority,
    description,
    entityType: entityType || 'GENERAL_OPERATIONS',
    entityId: entityId || null,
    responsiblePersonId: req.user!.id,
  });

  notifyRole('MANAGER', 'OPERATIONAL_EVENT', `Event Logged: ${eventType}`, description, '/manager/command-center');
  res.status(201).json({ id, message: 'Operational event logged.' });
});

// --- 13.2 RULE-BASED BOTTLENECK DETECTION ENGINE ---
app.get('/api/bottleneck-analysis', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const departments = db.prepare(`SELECT * FROM departments`).all() as any[];
  const machines = db.prepare(`SELECT * FROM machines`).all() as any[];
  const workers = db.prepare(`SELECT * FROM workers`).all() as any[];
  const orders = db.prepare(`SELECT * FROM production_orders WHERE status IN ('PENDING', 'IN_PROGRESS')`).all() as any[];
  const tasks = db.prepare(`SELECT * FROM production_tasks WHERE status IN ('NOT_STARTED', 'IN_PROGRESS')`).all() as any[];
  const maint = db.prepare(`SELECT * FROM maintenance_requests WHERE status != 'COMPLETED'`).all() as any[];

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

  const detected: BottleneckItem[] = [];
  const now = new Date().toISOString();

  // Rule A: WORKFORCE SHORTAGE (Active tasks in department vs available workers)
  for (const dept of departments) {
    const deptWorkers = workers.filter((w) => w.department_id === dept.id && (w.availability === 'AVAILABLE' || w.availability === 'ASSIGNED'));
    const deptTasks = tasks.filter((t) => {
      const order = orders.find((o) => o.id === t.order_id);
      return order && order.department_id === dept.id;
    });
    const requiredWorkers = Math.max(1, deptTasks.length);
    const availableWorkers = deptWorkers.length;

    if (requiredWorkers > availableWorkers || availableWorkers === 0) {
      const gap = requiredWorkers - availableWorkers;
      detected.push({
        id: uuid(),
        departmentId: dept.id,
        departmentName: dept.name,
        orderId: deptTasks[0]?.order_id || null,
        orderCode: orders.find((o) => o.id === deptTasks[0]?.order_id)?.order_code || null,
        category: 'WORKFORCE_SHORTAGE',
        severity: gap >= 2 ? 'CRITICAL' : 'HIGH',
        requiredCapacity: requiredWorkers,
        availableCapacity: availableWorkers,
        capacityGap: gap,
        supportingData: {
          scheduledTasks: deptTasks.length,
          deptHeadcount: deptWorkers.length,
          deficit: gap,
        },
        operationalImpact: `Line starvation risk in ${dept.name}; ${gap} workstation(s) lack assigned qualified operators.`,
        recommendedAction: `Dispatch floating cross-trained operators or authorize emergency overtime shift rebalance.`,
        status: 'CONFIRMED',
        detectedAt: now,
      });
    }
  }

  // Rule B: MACHINE CAPACITY SHORTAGE (Order production target vs operational machine capacity)
  for (const dept of departments) {
    const deptMachines = machines.filter((m) => m.department_id === dept.id && m.status === 'OPERATING');
    const totalHourlyCap = deptMachines.reduce((sum, m) => sum + (m.capacity_units_per_hr || 0), 0);
    const deptOrders = orders.filter((o) => o.department_id === dept.id);
    const remainingUnits = deptOrders.reduce((sum, o) => sum + (o.target_qty - o.produced_qty), 0);
    // Standard 8-hr shift capacity
    const shiftCapacity = totalHourlyCap * 8;

    if (shiftCapacity > 0 && remainingUnits > shiftCapacity * 1.3) {
      const gapUnits = remainingUnits - shiftCapacity;
      detected.push({
        id: uuid(),
        departmentId: dept.id,
        departmentName: dept.name,
        orderId: deptOrders[0]?.id || null,
        orderCode: deptOrders[0]?.order_code || null,
        category: 'MACHINE_CAPACITY_SHORTAGE',
        severity: remainingUnits > shiftCapacity * 2 ? 'CRITICAL' : 'HIGH',
        requiredCapacity: remainingUnits,
        availableCapacity: shiftCapacity,
        capacityGap: gapUnits,
        supportingData: {
          remainingUnits,
          shiftCapacityUnits: shiftCapacity,
          activeOperatingMachines: deptMachines.length,
          utilizationRatio: Math.round((remainingUnits / shiftCapacity) * 100),
        },
        operationalImpact: `${dept.name} order backlog exceeds 8h operational throughput by ${gapUnits} units.`,
        recommendedAction: `Split order volume into parallel secondary machine stream or activate secondary line schedule.`,
        status: 'CONFIRMED',
        detectedAt: now,
      });
    }
  }

  // Rule C: MACHINE DOWNTIME (Machines in FAULT / UNDER_MAINTENANCE)
  for (const m of machines) {
    if (m.status === 'FAULT' || m.status === 'UNDER_MAINTENANCE') {
      const dept = departments.find((d) => d.id === m.department_id);
      const lostCap = (m.capacity_units_per_hr || 25) * 8;
      const relatedMaint = maint.find((req) => req.machine_id === m.id);

      detected.push({
        id: uuid(),
        departmentId: m.department_id,
        departmentName: dept?.name || 'Shop Floor',
        orderId: null,
        orderCode: null,
        category: 'MACHINE_DOWNTIME',
        severity: m.status === 'FAULT' ? 'CRITICAL' : 'HIGH',
        requiredCapacity: lostCap,
        availableCapacity: 0,
        capacityGap: lostCap,
        supportingData: {
          machineCode: m.machine_code,
          machineName: m.name,
          currentStatus: m.status,
          lostOutputPerShift: lostCap,
          maintenanceTicket: relatedMaint?.request_code || 'Pending Dispatch',
        },
        operationalImpact: `${m.machine_code} unavailable: ${lostCap} units/shift capacity blocked during outage.`,
        recommendedAction: `Expedite maintenance technician intervention and trigger Recovery Engine machine reroute.`,
        status: 'CONFIRMED',
        detectedAt: now,
      });
    }
  }

  // Rule D: UNBALANCED ALLOCATION (Line load variance across shop floor)
  const deptUtils = departments.map((d) => {
    const dMachines = machines.filter((m) => m.department_id === d.id);
    const avgUtil = dMachines.length > 0 ? dMachines.reduce((acc, m) => acc + (m.utilization_pct || 0), 0) / dMachines.length : 0;
    return { dept: d, avgUtil };
  });

  const maxUtil = deptUtils.reduce((prev, curr) => (curr.avgUtil > prev.avgUtil ? curr : prev), deptUtils[0]);
  const minUtil = deptUtils.reduce((prev, curr) => (curr.avgUtil < prev.avgUtil ? curr : prev), deptUtils[0]);

  if (maxUtil && minUtil && maxUtil.avgUtil > 80 && minUtil.avgUtil < 50 && maxUtil.dept.id !== minUtil.dept.id) {
    detected.push({
      id: uuid(),
      departmentId: maxUtil.dept.id,
      departmentName: maxUtil.dept.name,
      orderId: null,
      orderCode: null,
      category: 'UNBALANCED_ALLOCATION',
      severity: 'MEDIUM',
      requiredCapacity: Math.round(maxUtil.avgUtil),
      availableCapacity: Math.round(minUtil.avgUtil),
      capacityGap: Math.round(maxUtil.avgUtil - minUtil.avgUtil),
      supportingData: {
        overloadedDepartment: maxUtil.dept.name,
        overloadedUtilPct: Math.round(maxUtil.avgUtil),
        underloadedDepartment: minUtil.dept.name,
        underloadedUtilPct: Math.round(minUtil.avgUtil),
      },
      operationalImpact: `Imbalanced line loading (${Math.round(maxUtil.avgUtil)}% vs ${Math.round(minUtil.avgUtil)}%) creating inter-departmental buffer accumulation.`,
      recommendedAction: `Transfer non-specialized sub-assembly work orders to ${minUtil.dept.name} to smooth takt times.`,
      status: 'POTENTIAL',
      detectedAt: now,
    });
  }

  // Rule E: SHIFT STAFFING SHORTAGE (Shifts below minimum required operators)
  const shifts = db.prepare(`SELECT * FROM shifts`).all() as any[];
  for (const s of shifts) {
    const shiftWorkers = db.prepare(`
      SELECT COUNT(*) as c FROM attendance WHERE shift_id = ? AND status = 'PRESENT'
    `).get(s.id) as any;
    const count = shiftWorkers.c || 0;
    const minStaffing = 4; // factory baseline
    if (count < minStaffing) {
      detected.push({
        id: uuid(),
        departmentId: departments[0]?.id || 'D1',
        departmentName: 'All Departments',
        orderId: null,
        orderCode: null,
        category: 'SHIFT_STAFFING_SHORTAGE',
        severity: count <= 1 ? 'CRITICAL' : 'HIGH',
        requiredCapacity: minStaffing,
        availableCapacity: count,
        capacityGap: minStaffing - count,
        supportingData: {
          shiftName: s.name,
          shiftCode: s.shift_code,
          activePresent: count,
          minimumRequirement: minStaffing,
        },
        operationalImpact: `Shift ${s.name} operating at ${(count / minStaffing) * 100}% staffing minimum.`,
        recommendedAction: `Call in backup relief pool or consolidate assembly stages onto lead cells.`,
        status: 'CONFIRMED',
        detectedAt: now,
      });
    }
  }

  // Rule F: SCHEDULING CONFLICT (Multiple in-progress tasks on same machine)
  const machineTaskCounts = new Map<string, any[]>();
  for (const t of tasks) {
    if (t.machine_id && t.status === 'IN_PROGRESS') {
      const list = machineTaskCounts.get(t.machine_id) || [];
      list.push(t);
      machineTaskCounts.set(t.machine_id, list);
    }
  }
  machineTaskCounts.forEach((taskList, mId) => {
    if (taskList.length > 1) {
      const m = machines.find((mach) => mach.id === mId);
      const dept = departments.find((d) => d.id === m?.department_id);
      detected.push({
        id: uuid(),
        departmentId: m?.department_id || departments[0]?.id,
        departmentName: dept?.name || 'Shop Floor',
        orderId: taskList[0].order_id,
        orderCode: orders.find((o) => o.id === taskList[0].order_id)?.order_code || null,
        category: 'SCHEDULING_CONFLICT',
        severity: 'HIGH',
        requiredCapacity: taskList.length,
        availableCapacity: 1,
        capacityGap: taskList.length - 1,
        supportingData: {
          machineCode: m?.machine_code,
          conflictingTaskCount: taskList.length,
          taskTitles: taskList.map((t) => t.title),
        },
        operationalImpact: `Machine ${m?.machine_code} has ${taskList.length} concurrent IN_PROGRESS tasks contending for spindle time.`,
        recommendedAction: `Sequence conflicting tasks into FIFO queue or re-route second task to an idle adjacent station.`,
        status: 'CONFIRMED',
        detectedAt: now,
      });
    }
  });

  // Store/sync confirmed bottlenecks into bottleneck_analysis table
  const ins = db.prepare(`
    INSERT OR REPLACE INTO bottleneck_analysis (
      id, department_id, order_id, category, severity, required_capacity, available_capacity, capacity_gap, supporting_data_json, operational_impact, recommended_action, status, detected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  detected.forEach((b) => {
    try {
      ins.run(
        b.id,
        b.departmentId,
        b.orderId,
        b.category,
        b.severity,
        b.requiredCapacity,
        b.availableCapacity,
        b.capacityGap,
        JSON.stringify(b.supportingData),
        b.operationalImpact,
        b.recommendedAction,
        b.status,
        b.detectedAt
      );
    } catch {
      // Ignored for duplicates
    }
  });

  res.json({
    bottlenecks: detected,
    summary: {
      total: detected.length,
      critical: detected.filter((b) => b.severity === 'CRITICAL').length,
      high: detected.filter((b) => b.severity === 'HIGH').length,
      medium: detected.filter((b) => b.severity === 'MEDIUM').length,
      low: detected.filter((b) => b.severity === 'LOW').length,
    },
  });
});

app.post('/api/bottleneck-analysis/:id/mitigate', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  db.prepare(`UPDATE bottleneck_analysis SET status = 'MITIGATED' WHERE id = ?`).run(req.params.id);
  createAuditLog(req.user!.id, 'MITIGATE', 'BOTTLENECK', req.params.id, 'Manager mitigated identified bottleneck.');
  res.json({ message: 'Bottleneck marked as mitigated.' });
});

// --- 13.3 SHIFT HANDOVER MODULE ---
app.get('/api/shift-handover/current-context', requireAuth, requireRoles('MANAGER', 'ADMIN', 'WORKER'), (_req, res) => {
  const pendingTasks = db.prepare(`
    SELECT pt.id, pt.title, pt.status, pt.priority, po.order_code, m.machine_code, d.name as department_name
    FROM production_tasks pt
    JOIN production_orders po ON pt.order_id = po.id
    LEFT JOIN machines m ON pt.machine_id = m.id
    LEFT JOIN departments d ON po.department_id = d.id
    WHERE pt.status IN ('NOT_STARTED', 'IN_PROGRESS')
    ORDER BY pt.priority DESC LIMIT 15
  `).all();

  const machineFaults = db.prepare(`
    SELECT m.id, m.machine_code, m.name, m.status, d.name as department_name
    FROM machines m
    JOIN departments d ON m.department_id = d.id
    WHERE m.status IN ('FAULT', 'UNDER_MAINTENANCE')
  `).all();

  const unresolvedSafety = db.prepare(`
    SELECT id, incident_code, severity, title, status, created_at
    FROM safety_incidents
    WHERE status != 'RESOLVED'
  `).all();

  const openMaintenance = db.prepare(`
    SELECT mr.id, mr.ticket_code, mr.priority, mr.title, mr.status, m.machine_code
    FROM maintenance_requests mr
    JOIN machines m ON mr.machine_id = m.id
    WHERE mr.status != 'COMPLETED'
  `).all();

  const shifts = db.prepare(`SELECT * FROM shifts ORDER BY start_time ASC`).all();
  const departments = db.prepare(`SELECT * FROM departments ORDER BY name ASC`).all();

  res.json({
    pendingTasks,
    machineFaults,
    unresolvedSafety,
    openMaintenance,
    shifts,
    departments,
  });
});

app.get('/api/shift-handover', requireAuth, (req, res) => {
  const handovers = db.prepare(`
    SELECT sh.*, d.name as department_name, f.name as factory_name,
           os.name as outgoing_shift_name, is_shift.name as incoming_shift_name,
           sub.full_name as submitted_by_name, ack.full_name as acknowledged_by_name
    FROM shift_handovers sh
    JOIN departments d ON sh.department_id = d.id
    JOIN factories f ON sh.factory_id = f.id
    JOIN shifts os ON sh.outgoing_shift_id = os.id
    JOIN shifts is_shift ON sh.incoming_shift_id = is_shift.id
    JOIN users sub ON sh.submitted_by_id = sub.id
    LEFT JOIN users ack ON sh.acknowledged_by_id = ack.id
    ORDER BY sh.created_at DESC LIMIT 30
  `).all();

  res.json({ handovers });
});

app.post('/api/shift-handover', requireAuth, requireRoles('MANAGER', 'ADMIN', 'WORKER'), (req, res) => {
  const {
    departmentId,
    outgoingShiftId,
    incomingShiftId,
    pendingTasks,
    machineFaults,
    maintenanceStatus,
    safetyIncidents,
    operationalNotes,
  } = req.body;

  if (!departmentId || !outgoingShiftId || !incomingShiftId || !operationalNotes) {
    return res.status(400).json({ error: 'Department, shifts, and operational notes are required.' });
  }

  const dept = db.prepare(`SELECT factory_id, name FROM departments WHERE id = ?`).get(departmentId) as any;
  if (!dept) return res.status(404).json({ error: 'Department not found.' });

  const id = uuid();
  const code = `HND-${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO shift_handovers (
      id, handover_code, factory_id, department_id, outgoing_shift_id, incoming_shift_id,
      submitted_by_id, handover_date, pending_tasks_json, machine_faults_json,
      maintenance_status_json, safety_incidents_json, operationalNotes, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)
  `).run(
    id,
    code,
    dept.factory_id,
    departmentId,
    outgoingShiftId,
    incomingShiftId,
    req.user!.id,
    now.slice(0, 10),
    JSON.stringify(pendingTasks || []),
    JSON.stringify(machineFaults || []),
    JSON.stringify(maintenanceStatus || []),
    JSON.stringify(safetyIncidents || []),
    operationalNotes,
    now
  );

  createOperationalEvent({
    eventType: 'SHIFT_HANDOVER',
    priority: 'MEDIUM',
    description: `Shift handover ${code} submitted for ${dept.name} by ${req.user!.fullName}`,
    entityType: 'SHIFT_HANDOVER',
    entityId: id,
    responsiblePersonId: req.user!.id,
  });

  notifyRole('MANAGER', 'SHIFT_HANDOVER', `Shift Handover Submitted: ${code}`, `Handover logged for ${dept.name}`, '/manager/shift-handover');
  createAuditLog(req.user!.id, 'CREATE', 'SHIFT_HANDOVER', id, `Submitted shift handover ${code} for ${dept.name}`);

  res.status(201).json({ id, handoverCode: code, message: 'Shift handover report filed successfully.' });
});

app.post('/api/shift-handover/:id/acknowledge', requireAuth, requireRoles('MANAGER', 'ADMIN', 'WORKER'), (req, res) => {
  const handover = db.prepare(`SELECT * FROM shift_handovers WHERE id = ?`).get(req.params.id) as any;
  if (!handover) return res.status(404).json({ error: 'Shift handover record not found.' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE shift_handovers
    SET status = 'ACKNOWLEDGED', acknowledged_by_id = ?, acknowledged_at = ?
    WHERE id = ?
  `).run(req.user!.id, now, req.params.id);

  createOperationalEvent({
    eventType: 'SHIFT_HANDOVER_ACKNOWLEDGED',
    priority: 'LOW',
    description: `Shift handover ${handover.handover_code} acknowledged by incoming supervisor ${req.user!.fullName}`,
    entityType: 'SHIFT_HANDOVER',
    entityId: req.params.id,
    responsiblePersonId: req.user!.id,
  });

  createAuditLog(req.user!.id, 'ACKNOWLEDGE', 'SHIFT_HANDOVER', req.params.id, `Acknowledged handover ${handover.handover_code}`);
  res.json({ message: 'Shift handover acknowledged.' });
});

// --- 13.4 LIGHTWEIGHT QUALITY INSPECTION ---
app.get('/api/quality/inspections', requireAuth, (_req, res) => {
  const inspections = db.prepare(`
    SELECT qi.*, po.order_code, po.product_name, u.full_name as inspector_name, pt.title as task_title
    FROM quality_inspections qi
    JOIN production_orders po ON qi.order_id = po.id
    JOIN users u ON qi.inspector_id = u.id
    LEFT JOIN production_tasks pt ON qi.task_id = pt.id
    ORDER BY qi.inspection_date DESC LIMIT 40
  `).all();

  res.json({ inspections });
});

app.post('/api/quality/inspections', requireAuth, requireRoles('WORKER', 'MANAGER', 'ADMIN'), (req, res) => {
  const { orderId, taskId, inspectedQty, acceptedQty, rejectedQty, rejectionCategory, notes } = req.body;

  if (!orderId || inspectedQty == null || acceptedQty == null || rejectedQty == null) {
    return res.status(400).json({ error: 'Order ID, inspectedQty, acceptedQty, and rejectedQty are required.' });
  }

  const inspected = Number(inspectedQty);
  const accepted = Number(acceptedQty);
  const rejected = Number(rejectedQty);

  if (inspected <= 0) {
    return res.status(400).json({ error: 'Inspected quantity must be greater than zero.' });
  }
  if (accepted < 0 || rejected < 0) {
    return res.status(400).json({ error: 'Quantities cannot be negative.' });
  }
  // Formula validation: accepted + rejected === inspected
  if (accepted + rejected !== inspected) {
    return res.status(400).json({
      error: `Mathematical validation failed: accepted (${accepted}) + rejected (${rejected}) must equal inspected (${inspected}).`,
    });
  }

  const qualityRate = Math.round(((accepted / inspected) * 100) * 10) / 10;
  const id = uuid();
  const code = `QI-${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO quality_inspections (
        id, inspection_code, order_id, task_id, inspector_id,
        inspected_qty, accepted_qty, rejected_qty, quality_rate,
        rejection_category, notes, inspection_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      code,
      orderId,
      taskId || null,
      req.user!.id,
      inspected,
      accepted,
      rejected,
      qualityRate,
      rejectionCategory || 'NONE',
      notes || null,
      now.slice(0, 10),
      now
    );

    // Update production order defect rate
    const past = db.prepare(`
      SELECT SUM(inspected_qty) as total_ins, SUM(rejected_qty) as total_rej
      FROM quality_inspections WHERE order_id = ?
    `).get(orderId) as any;
    if (past && past.total_ins > 0) {
      const overallDefectRate = ((past.total_rej / past.total_ins) * 100);
      db.prepare(`UPDATE production_orders SET defect_rate_pct = ? WHERE id = ?`).run(
        Math.round(overallDefectRate * 10) / 10,
        orderId
      );
    }
  });
  tx();

  if (rejected > 0 && qualityRate < 95) {
    const order = db.prepare(`SELECT order_code FROM production_orders WHERE id = ?`).get(orderId) as any;
    createOperationalEvent({
      eventType: 'QUALITY_ANOMALY',
      priority: qualityRate < 85 ? 'HIGH' : 'MEDIUM',
      description: `Quality inspection ${code} on ${order?.order_code || 'Order'}: ${rejected} rejected units (${qualityRate}% yield). Category: ${rejectionCategory}`,
      entityType: 'QUALITY_INSPECTION',
      entityId: id,
      responsiblePersonId: req.user!.id,
    });
  }

  createAuditLog(req.user!.id, 'CREATE', 'QUALITY_INSPECTION', id, `Recorded inspection ${code} with yield ${qualityRate}%`);
  res.status(201).json({ id, inspectionCode: code, qualityRate, message: 'Quality inspection saved.' });
});

app.get('/api/quality/analytics', requireAuth, (_req, res) => {
  const totals = db.prepare(`
    SELECT SUM(inspected_qty) as total_ins, SUM(accepted_qty) as total_acc, SUM(rejected_qty) as total_rej
    FROM quality_inspections
  `).get() as any;

  const byCategory = db.prepare(`
    SELECT rejection_category, SUM(rejected_qty) as count
    FROM quality_inspections
    WHERE rejection_category != 'NONE' AND rejection_category IS NOT NULL
    GROUP BY rejection_category
  `).all();

  const totalIns = totals?.total_ins || 0;
  const totalAcc = totals?.total_acc || 0;
  const totalRej = totals?.total_rej || 0;
  const overallYield = totalIns > 0 ? Math.round(((totalAcc / totalIns) * 100) * 10) / 10 : 100;

  res.json({
    totalInspected: totalIns,
    totalAccepted: totalAcc,
    totalRejected: totalRej,
    overallYield,
    defectBreakdown: byCategory,
  });
});

// --- 13.5 PRIORITY & ESCALATION ENGINE ---
app.get('/api/escalation/rules', requireAuth, (_req, res) => {
  const rules = db.prepare(`SELECT * FROM escalation_rules ORDER BY deadline_minutes ASC`).all();
  res.json({ rules });
});

app.patch('/api/escalation/rules/:id', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { deadlineMinutes, escalationRole, isActive } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE escalation_rules
    SET deadline_minutes = COALESCE(?, deadline_minutes),
        escalation_role = COALESCE(?, escalation_role),
        is_active = COALESCE(?, is_active),
        updated_at = ?
    WHERE id = ?
  `).run(deadlineMinutes, escalationRole, isActive != null ? (isActive ? 1 : 0) : null, now, req.params.id);

  createAuditLog(req.user!.id, 'UPDATE', 'ESCALATION_RULE', req.params.id, 'Updated priority SLA threshold.');
  res.json({ message: 'Escalation rule updated.' });
});

app.get('/api/escalation/history', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const history = db.prepare(`
    SELECT eh.*, u.full_name as escalated_to_name
    FROM escalation_history eh
    LEFT JOIN users u ON eh.escalated_to_id = u.id
    ORDER BY eh.escalated_at DESC LIMIT 30
  `).all();

  res.json({ history });
});

app.post('/api/escalation/check', requireAuth, requireRoles('MANAGER', 'ADMIN'), (_req, res) => {
  const rules = db.prepare(`SELECT * FROM escalation_rules WHERE is_active = 1`).all() as any[];
  const rulesMap = new Map(rules.map((r) => [r.priority, r.deadline_minutes]));

  const openMaint = db.prepare(`SELECT * FROM maintenance_requests WHERE status != 'COMPLETED'`).all() as any[];
  const openSafety = db.prepare(`SELECT * FROM safety_incidents WHERE status != 'RESOLVED'`).all() as any[];

  const newlyEscalated: any[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  // Check Maintenance Requests
  for (const m of openMaint) {
    const limitMin = rulesMap.get(m.priority) || 120;
    const createdAt = new Date(m.created_at);
    const elapsedMinutes = (now.getTime() - createdAt.getTime()) / 60000;

    if (elapsedMinutes > limitMin) {
      const existing = db.prepare(`
        SELECT id FROM escalation_history WHERE entity_type = 'MAINTENANCE_REQUEST' AND entity_id = ?
      `).get(m.id);

      if (!existing) {
        const id = uuid();
        const reason = `SLA Exceeded: Maintenance ticket ${m.ticket_code} (${m.priority}) open for ${Math.round(elapsedMinutes)}m (Limit: ${limitMin}m)`;

        db.prepare(`
          INSERT INTO escalation_history (
            id, entity_type, entity_id, priority, deadline_at, escalated_at, reason, status
          ) VALUES (?, 'MAINTENANCE_REQUEST', ?, ?, ?, ?, ?, 'OPEN')
        `).run(
          id,
          m.id,
          m.priority,
          new Date(createdAt.getTime() + limitMin * 60000).toISOString(),
          nowIso,
          reason
        );

        createOperationalEvent({
          eventType: 'MAINTENANCE_ESCALATED',
          priority: m.priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          description: reason,
          entityType: 'MAINTENANCE_REQUEST',
          entityId: m.id,
        });

        notifyRole('MANAGER', 'ESCALATION', `SLA Breach: ${m.ticket_code}`, reason, '/manager/command-center');
        notifyRole('ADMIN', 'ESCALATION', `SLA Breach: ${m.ticket_code}`, reason, '/admin/dashboard');

        newlyEscalated.push({ entity: 'MAINTENANCE', id: m.id, code: m.ticket_code, reason });
      }
    }
  }

  // Check Safety Incidents
  for (const s of openSafety) {
    const limitMin = rulesMap.get(s.severity) || 60;
    const createdAt = new Date(s.created_at);
    const elapsedMinutes = (now.getTime() - createdAt.getTime()) / 60000;

    if (elapsedMinutes > limitMin) {
      const existing = db.prepare(`
        SELECT id FROM escalation_history WHERE entity_type = 'SAFETY_INCIDENT' AND entity_id = ?
      `).get(s.id);

      if (!existing) {
        const id = uuid();
        const reason = `SLA Exceeded: Safety incident ${s.incident_code} (${s.severity}) unresolved for ${Math.round(elapsedMinutes)}m (Limit: ${limitMin}m)`;

        db.prepare(`
          INSERT INTO escalation_history (
            id, entity_type, entity_id, priority, deadline_at, escalated_at, reason, status
          ) VALUES (?, 'SAFETY_INCIDENT', ?, ?, ?, ?, ?, 'OPEN')
        `).run(
          id,
          s.id,
          s.severity,
          new Date(createdAt.getTime() + limitMin * 60000).toISOString(),
          nowIso,
          reason
        );

        createOperationalEvent({
          eventType: 'SAFETY_ESCALATED',
          priority: 'CRITICAL',
          description: reason,
          entityType: 'SAFETY_INCIDENT',
          entityId: s.id,
        });

        notifyRole('MANAGER', 'ESCALATION', `Critical Safety SLA Breach: ${s.incident_code}`, reason, '/manager/command-center');
        notifyRole('ADMIN', 'ESCALATION', `Critical Safety SLA Breach: ${s.incident_code}`, reason, '/admin/dashboard');

        newlyEscalated.push({ entity: 'SAFETY', id: s.id, code: s.incident_code, reason });
      }
    }
  }

  res.json({
    checkedCount: openMaint.length + openSafety.length,
    escalatedCount: newlyEscalated.length,
    newlyEscalated,
  });
});

// --- 13.6 SCENARIO COMPARISON (MULTI-SCENARIO SIMULATION UPGRADE) ---
app.post('/api/scenario-simulator/compare', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { disruptionType, machineId, orderId, delayHours = 4 } = req.body;

  // Retrieve base disruption entities
  const machine = machineId ? db.prepare(`SELECT * FROM machines WHERE id = ?`).get(machineId) as any : null;
  const order = orderId ? db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(orderId) as any : null;

  // Compute 3 distinctive simulated operational scenarios
  const scenarios = [
    {
      scenarioId: 'SCENARIO_A',
      title: 'Scenario A: Direct Machine Reroute & Rebalance',
      description: 'Reallocates production to the nearest idle compatible machine on the same shop floor without altering worker shift schedules.',
      strategy: 'Nearest compatible machine; baseline operating rates.',
      metrics: {
        scheduleDelayHrs: Number(delayHours) + 1.2,
        capacityUtilizationPct: 82,
        recoveryCostUsd: 480,
        feasibilityScore: 88,
        riskLevel: 'LOW',
      },
      assumptions: [
        'Adjacent station has compatible tooling adapters installed.',
        'Existing shift workers possess required operating certifications.',
        'Zero overtime pay required.',
      ],
      tradeoffs: 'Low implementation friction; moderate schedule recovery buffer.',
    },
    {
      scenarioId: 'SCENARIO_B',
      title: 'Scenario B: Overtime & Dynamic Skill Cross-Allocation',
      description: 'Activates high-proficiency senior certified operators with 2 hours authorized overtime to fast-track remaining batch processing.',
      strategy: 'High-proficiency operator assignment + authorized 2.0h overtime burst.',
      metrics: {
        scheduleDelayHrs: Math.max(0.4, Number(delayHours) - 1.8),
        capacityUtilizationPct: 94,
        recoveryCostUsd: 1250,
        feasibilityScore: 92,
        riskLevel: 'MEDIUM',
      },
      assumptions: [
        'Operators agree to 2h overtime shift extension.',
        'Line throughput increases by 25% due to Level 4 operator proficiency.',
        'Expedited QA clearance provided upon batch completion.',
      ],
      tradeoffs: 'Fastest delivery recovery; higher labor expenditure.',
    },
    {
      scenarioId: 'SCENARIO_C',
      title: 'Scenario C: Split-Stream Parallel Processing',
      description: 'Splits remaining production lot 60/40 between two secondary operational lines, balancing load across multiple workstations simultaneously.',
      strategy: 'Batch splitting across two parallel secondary cells.',
      metrics: {
        scheduleDelayHrs: Math.max(0.8, Number(delayHours) - 1.2),
        capacityUtilizationPct: 89,
        recoveryCostUsd: 890,
        feasibilityScore: 78,
        riskLevel: 'MEDIUM',
      },
      assumptions: [
        'Both secondary machines remain operational throughout shift.',
        'Dual setup time requires 35 minutes re-calibration.',
        'Quality inspection overhead doubles across parallel split streams.',
      ],
      tradeoffs: 'High throughput; heightened coordination complexity.',
    },
  ];

  const comparisonId = uuid();
  const comparisonCode = `CMP-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO scenario_comparisons (id, comparison_code, title, created_by_id, scenarios_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    comparisonId,
    comparisonCode,
    `Multi-Scenario Evaluation for ${machine ? machine.machine_code : order ? order.order_code : 'Shop Floor Disruption'}`,
    req.user!.id,
    JSON.stringify(scenarios),
    new Date().toISOString()
  );

  res.json({
    comparisonId,
    comparisonCode,
    disruptionContext: {
      type: disruptionType || 'MACHINE_FAULT',
      machineCode: machine?.machine_code || 'All Bays',
      orderCode: order?.order_code || 'General Orders',
    },
    scenarios,
  });
});

app.post('/api/scenario-simulator/convert-to-plan', requireAuth, requireRoles('MANAGER', 'ADMIN'), (req, res) => {
  const { scenarioId, comparisonId, notes } = req.body;
  if (!scenarioId) return res.status(400).json({ error: 'Scenario ID is required.' });

  const comp = comparisonId ? (db.prepare(`SELECT * FROM scenario_comparisons WHERE id = ?`).get(comparisonId) as any) : null;
  const planCode = `REC-${Date.now().toString().slice(-6)}`;
  const planId = uuid();
  const now = new Date().toISOString();

  // Find a target operating machine and available worker for assignment
  const targetMachine = db.prepare(`SELECT * FROM machines WHERE status = 'OPERATING' LIMIT 1`).get() as any;
  const targetWorker = db.prepare(`SELECT * FROM workers WHERE availability = 'AVAILABLE' LIMIT 1`).get() as any;
  const activeOrder = db.prepare(`SELECT * FROM production_orders WHERE status = 'IN_PROGRESS' LIMIT 1`).get() as any;

  const summary = `Converted from Simulator ${scenarioId}: ${notes || 'Multi-Scenario simulation approved for shop-floor deployment'}`;
  const weights = DEFAULT_WEIGHTS;
  const beforeMetrics = captureCurrentMetrics();
  const afterMetrics = { ...beforeMetrics, estimatedProductionDelayHrs: 1.2, resourceUtilizationPct: 88 };

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO recovery_plans (id, plan_code, event_type, summary, status, weights_json, before_metrics_json, after_metrics_json, created_at)
      VALUES (?, ?, 'SCENARIO_SIMULATION', ?, 'PROPOSED', ?, ?, ?, ?)
    `).run(
      planId,
      planCode,
      summary,
      JSON.stringify(weights),
      JSON.stringify(beforeMetrics),
      JSON.stringify(afterMetrics),
      now
    );

    if (targetMachine && targetWorker) {
      db.prepare(`
        INSERT INTO recovery_recommendations (
          id, plan_id, order_id, target_machine_id, worker_id, skill_score, availability_score, machine_compat_score, priority_score, efficiency_score, total_normalized_score, rationale, selected
        ) VALUES (?, ?, ?, ?, ?, 90, 85, 95, 80, 85, 89.5, ?, 1)
      `).run(
        uuid(),
        planId,
        activeOrder?.id || null,
        targetMachine.id,
        targetWorker.id,
        `Generated from Simulation ${scenarioId}: Reassigned to ${targetMachine.machine_code} with operator ${targetWorker.user_id}`
      );
    }
  });
  tx();

  createOperationalEvent({
    eventType: 'RECOVERY_PLAN_PROPOSED',
    priority: 'HIGH',
    description: `Simulation ${scenarioId} converted to live Recovery Proposal ${planCode}`,
    entityType: 'RECOVERY_PLAN',
    entityId: planId,
    responsiblePersonId: req.user!.id,
  });

  notifyRole('MANAGER', 'RECOVERY_PLAN', `Live Plan Created: ${planCode}`, summary, '/manager/recovery-engine');
  createAuditLog(req.user!.id, 'CONVERT_SCENARIO', 'RECOVERY_PLAN', planId, `Converted scenario ${scenarioId} to recovery plan ${planCode}`);

  res.status(201).json({ planId, planCode, message: 'Scenario converted to live recovery proposal successfully.' });
});

// --- 13.7 AUTHORIZED DATA MANAGEMENT (CSV IMPORT & EXPORT) ---
function parseCsvSimple(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = (values[idx] || '').replace(/^"|"$/g, '');
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

app.post('/api/admin/data-management/validate-csv', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { entity, csvText } = req.body;
  if (!entity || !csvText) {
    return res.status(400).json({ error: 'Target entity and csvText are required.' });
  }

  const { headers, rows } = parseCsvSimple(csvText);
  if (rows.length === 0) {
    return res.status(400).json({ error: 'CSV file contains no valid data rows or empty headers.' });
  }

  const errors: { row: number; field: string; message: string }[] = [];
  const preview: any[] = [];

  if (entity === 'workers') {
    const required = ['employee_code', 'full_name', 'email'];
    for (const r of required) {
      if (!headers.includes(r)) {
        return res.status(400).json({ error: `Missing required header column: "${r}" for workers import.` });
      }
    }

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      if (!row.employee_code) errors.push({ row: rowNum, field: 'employee_code', message: 'Employee code is required.' });
      if (!row.full_name) errors.push({ row: rowNum, field: 'full_name', message: 'Full name is required.' });
      if (!row.email || !row.email.includes('@')) errors.push({ row: rowNum, field: 'email', message: 'Valid email is required.' });

      // Check duplicate employee code in DB
      const existing = db.prepare(`SELECT id FROM users WHERE employee_code = ? OR email = ?`).get(row.employee_code, row.email);
      preview.push({
        ...row,
        _status: errors.some((e) => e.row === rowNum) ? 'INVALID' : existing ? 'EXISTS_UPDATE' : 'VALID_NEW',
      });
    });
  } else if (entity === 'machines') {
    const required = ['machine_code', 'name', 'department_code'];
    for (const r of required) {
      if (!headers.includes(r)) {
        return res.status(400).json({ error: `Missing required header column: "${r}" for machines import.` });
      }
    }

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      if (!row.machine_code) errors.push({ row: rowNum, field: 'machine_code', message: 'Machine code is required.' });
      if (!row.name) errors.push({ row: rowNum, field: 'name', message: 'Machine name is required.' });

      const dept = db.prepare(`SELECT id FROM departments WHERE code = ?`).get(row.department_code);
      if (!dept) errors.push({ row: rowNum, field: 'department_code', message: `Unknown department code: ${row.department_code}` });

      const existing = db.prepare(`SELECT id FROM machines WHERE machine_code = ?`).get(row.machine_code);
      preview.push({
        ...row,
        _status: errors.some((e) => e.row === rowNum) ? 'INVALID' : existing ? 'EXISTS_UPDATE' : 'VALID_NEW',
      });
    });
  } else if (entity === 'production_orders') {
    const required = ['order_code', 'product_name', 'target_qty', 'deadline'];
    for (const r of required) {
      if (!headers.includes(r)) {
        return res.status(400).json({ error: `Missing required header column: "${r}" for orders import.` });
      }
    }

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      if (!row.order_code) errors.push({ row: rowNum, field: 'order_code', message: 'Order code is required.' });
      if (!row.product_name) errors.push({ row: rowNum, field: 'product_name', message: 'Product name is required.' });
      if (isNaN(Number(row.target_qty)) || Number(row.target_qty) <= 0) {
        errors.push({ row: rowNum, field: 'target_qty', message: 'Target qty must be a positive number.' });
      }

      const existing = db.prepare(`SELECT id FROM production_orders WHERE order_code = ?`).get(row.order_code);
      preview.push({
        ...row,
        _status: errors.some((e) => e.row === rowNum) ? 'INVALID' : existing ? 'EXISTS_UPDATE' : 'VALID_NEW',
      });
    });
  } else {
    return res.status(400).json({ error: `Unsupported import entity: ${entity}. Supported: workers, machines, production_orders.` });
  }

  res.json({
    entity,
    totalRows: rows.length,
    validRows: rows.length - errors.length,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
    preview: preview.slice(0, 15),
  });
});

app.post('/api/admin/data-management/import-csv', requireAuth, requireRoles('ADMIN'), (req, res) => {
  const { entity, csvText } = req.body;
  if (!entity || !csvText) return res.status(400).json({ error: 'Entity and csvText are required.' });

  const { rows } = parseCsvSimple(csvText);
  let importedCount = 0;
  let updatedCount = 0;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    if (entity === 'workers') {
      const workerRole = db.prepare(`SELECT id FROM roles WHERE name = 'WORKER'`).get() as any;
      const defaultDept = db.prepare(`SELECT id FROM departments LIMIT 1`).get() as any;

      for (const row of rows) {
        if (!row.employee_code || !row.full_name || !row.email) continue;
        const existing = db.prepare(`SELECT id FROM users WHERE employee_code = ? OR email = ?`).get(row.employee_code, row.email) as any;

        if (existing) {
          db.prepare(`
            UPDATE users SET full_name = ?, phone = ?, updated_at = ? WHERE id = ?
          `).run(row.full_name, row.phone || null, now, existing.id);
          updatedCount++;
        } else {
          const userId = uuid();
          const passHash = hashPassword('DemoPulse!2026');
          db.prepare(`
            INSERT INTO users (id, role_id, department_id, email, password_hash, full_name, employee_code, phone, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `).run(userId, workerRole.id, defaultDept?.id || null, row.email, passHash, row.full_name, row.employee_code, row.phone || null, now, now);

          db.prepare(`
            INSERT INTO workers (id, user_id, department_id, designation, availability, hourly_cost, created_at)
            VALUES (?, ?, ?, ?, 'AVAILABLE', 28.5, ?)
          `).run(uuid(), userId, defaultDept?.id || null, row.designation || 'Machine Operator', now);
          importedCount++;
        }
      }
    } else if (entity === 'machines') {
      for (const row of rows) {
        if (!row.machine_code || !row.name) continue;
        const dept = db.prepare(`SELECT id FROM departments WHERE code = ?`).get(row.department_code) as any;
        const deptId = dept?.id || (db.prepare(`SELECT id FROM departments LIMIT 1`).get() as any).id;
        const existing = db.prepare(`SELECT id FROM machines WHERE machine_code = ?`).get(row.machine_code) as any;

        if (existing) {
          db.prepare(`
            UPDATE machines SET name = ?, capacity_units_per_hr = ?, updated_at = ? WHERE id = ?
          `).run(row.name, Number(row.capacity_units_per_hr) || 25, now, existing.id);
          updatedCount++;
        } else {
          db.prepare(`
            INSERT INTO machines (id, department_id, machine_code, name, model_number, status, capacity_units_per_hr, utilization_pct, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'OPERATING', ?, 80, ?, ?)
          `).run(uuid(), deptId, row.machine_code, row.name, row.model_number || 'IND-STD', Number(row.capacity_units_per_hr) || 25, now, now);
          importedCount++;
        }
      }
    } else if (entity === 'production_orders') {
      const defaultDept = db.prepare(`SELECT id FROM departments LIMIT 1`).get() as any;
      for (const row of rows) {
        if (!row.order_code || !row.product_name) continue;
        const existing = db.prepare(`SELECT id FROM production_orders WHERE order_code = ?`).get(row.order_code) as any;

        if (existing) {
          db.prepare(`
            UPDATE production_orders SET product_name = ?, target_qty = ?, deadline = ?, updated_at = ? WHERE id = ?
          `).run(row.product_name, Number(row.target_qty) || 100, row.deadline || now, now, existing.id);
          updatedCount++;
        } else {
          db.prepare(`
            INSERT INTO production_orders (id, order_code, product_name, department_id, target_qty, produced_qty, priority, status, start_date, deadline, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?, ?, ?)
          `).run(uuid(), row.order_code, row.product_name, defaultDept?.id, Number(row.target_qty) || 100, row.priority || 'MEDIUM', now, row.deadline || now, now, now);
          importedCount++;
        }
      }
    }

    db.prepare(`
      INSERT INTO data_import_jobs (id, imported_by_id, entity_type, total_rows, valid_rows, error_rows, summary_notes, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(uuid(), req.user!.id, entity, rows.length, importedCount + updatedCount, `Imported ${importedCount} new, updated ${updatedCount}`, now);
  });
  tx();

  createAuditLog(req.user!.id, 'CSV_IMPORT', entity.toUpperCase(), req.user!.id, `CSV Import completed for ${entity}: ${importedCount} created, ${updatedCount} updated.`);
  createOperationalEvent({
    eventType: 'DATA_MANAGEMENT_IMPORT',
    priority: 'LOW',
    description: `Admin ${req.user!.fullName} executed CSV import for ${entity} (${importedCount} new, ${updatedCount} updated)`,
    entityType: 'DATA_IMPORT',
    responsiblePersonId: req.user!.id,
  });

  res.json({
    entity,
    totalProcessed: rows.length,
    importedCount,
    updatedCount,
    message: `CSV import completed successfully.`,
  });
});

app.get('/api/admin/data-management/export-csv', requireAuth, requireRoles('ADMIN', 'MANAGER'), (req, res) => {
  const { entity = 'workers' } = req.query as { entity: string };

  let csvContent = '';
  let filename = `${entity}-export.csv`;

  if (entity === 'workers') {
    const workers = db.prepare(`
      SELECT u.employee_code, u.full_name, u.email, u.phone, w.designation, w.availability, w.hourly_cost, d.code as department_code
      FROM workers w
      JOIN users u ON w.user_id = u.id
      LEFT JOIN departments d ON w.department_id = d.id
    `).all() as any[];

    csvContent = 'employee_code,full_name,email,phone,designation,availability,hourly_cost,department_code\n';
    csvContent += workers.map((w) => `"${w.employee_code}","${w.full_name}","${w.email}","${w.phone || ''}","${w.designation}","${w.availability}",${w.hourly_cost},"${w.department_code || ''}"`).join('\n');
  } else if (entity === 'machines') {
    const machines = db.prepare(`
      SELECT m.machine_code, m.name, m.model_number, m.status, m.capacity_units_per_hr, m.utilization_pct, d.code as department_code
      FROM machines m
      JOIN departments d ON m.department_id = d.id
    `).all() as any[];

    csvContent = 'machine_code,name,model_number,status,capacity_units_per_hr,utilization_pct,department_code\n';
    csvContent += machines.map((m) => `"${m.machine_code}","${m.name}","${m.model_number || ''}","${m.status}",${m.capacity_units_per_hr},${m.utilization_pct},"${m.department_code}"`).join('\n');
  } else if (entity === 'production_orders') {
    const orders = db.prepare(`
      SELECT po.order_code, po.product_name, po.target_qty, po.produced_qty, po.priority, po.status, po.deadline, d.code as department_code
      FROM production_orders po
      LEFT JOIN departments d ON po.department_id = d.id
    `).all() as any[];

    csvContent = 'order_code,product_name,target_qty,produced_qty,priority,status,deadline,department_code\n';
    csvContent += orders.map((o) => `"${o.order_code}","${o.product_name}",${o.target_qty},${o.produced_qty},"${o.priority}","${o.status}","${o.deadline}","${o.department_code || ''}"`).join('\n');
  } else {
    return res.status(400).json({ error: 'Invalid export entity.' });
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// --- 13.8 DEDICATED DEMONSTRATION ENVIRONMENT ---
app.get('/api/admin/demo-environment/status', requireAuth, requireRoles('ADMIN', 'MANAGER'), (_req, res) => {
  const faultMachine = db.prepare(`SELECT * FROM machines WHERE machine_code = 'CNC-01'`).get() as any;
  const demoIncident = db.prepare(`SELECT * FROM maintenance_requests WHERE ticket_code LIKE 'MNT-DEMO%' AND status != 'COMPLETED'`).get() as any;
  const demoPlan = db.prepare(`SELECT * FROM recovery_plans WHERE summary LIKE '%DEMO_FAILURE%' AND status = 'PROPOSED'`).get() as any;

  res.json({
    isDemonstrationActive: faultMachine?.status === 'FAULT' || !!demoIncident,
    targetMachine: faultMachine,
    activeDemoTicket: demoIncident || null,
    activeDemoPlan: demoPlan || null,
  });
});

app.post('/api/admin/demo-environment/run-failure', requireAuth, requireRoles('ADMIN', 'MANAGER'), (req, res) => {
  const machine = db.prepare(`SELECT * FROM machines WHERE machine_code = 'CNC-01'`).get() as any;
  if (!machine) return res.status(404).json({ error: 'Demo machine CNC-01 not found.' });

  const now = new Date().toISOString();
  const ticketId = uuid();
  const ticketCode = `MNT-DEMO-${Date.now().toString().slice(-4)}`;

  const tx = db.transaction(() => {
    // 1. Mark CNC-01 as FAULT
    db.prepare(`UPDATE machines SET status = 'FAULT', updated_at = ? WHERE id = ?`).run(now, machine.id);

    // 2. Insert Critical Maintenance Request
    db.prepare(`
      INSERT INTO maintenance_requests (
        id, ticket_code, machine_id, reported_by_id, priority, fault_category, title, description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'CRITICAL', 'MECHANICAL', 'DEMO: Spindle Bearing High Thermal Runaway (98°C)', 'Simulated catastrophic spindle seizure on CNC-01 requiring bearing replacement and emergency line rerouting.', 'PENDING', ?, ?)
    `).run(ticketId, ticketCode, machine.id, req.user!.id, now, now);

    // 3. Insert Operational Event
    createOperationalEvent({
      eventType: 'MACHINE_FAULT',
      priority: 'CRITICAL',
      description: `DEMONSTRATION FAULT: Spindle bearing vibration trip on CNC-01 in Machining Bay. Line halted.`,
      entityType: 'MACHINE',
      entityId: machine.id,
      responsiblePersonId: req.user!.id,
    });
  });
  tx();

  // 4. Trigger Recovery Engine Analysis
  const recoveryAnalysis = analyzeDisruptionAndRecommend({
    eventType: 'MACHINE_FAULT',
    triggerEntityId: machine.id,
    weights: DEFAULT_WEIGHTS,
  });

  // Stamp the summary with DEMO_FAILURE flag for tracking
  if (recoveryAnalysis.planId) {
    db.prepare(`
      UPDATE recovery_plans SET summary = ? WHERE id = ?
    `).run(`[DEMO_FAILURE] Emergency recovery plan for simulated CNC-01 spindle bearing seizure`, recoveryAnalysis.planId);
  }

  notifyRole('MANAGER', 'DISRUPTION', `DEMO CRITICAL: Machine Trip on CNC-01`, `Emergency recovery plan ${recoveryAnalysis.planCode} generated.`, '/manager/recovery-engine');
  notifyRole('TECHNICIAN', 'MAINTENANCE', `DEMO TICKET: CNC-01 Spindle Seizure`, `Ticket ${ticketCode} dispatched.`, '/technician/dashboard');
  createAuditLog(req.user!.id, 'DEMO_RUN_FAILURE', 'SYSTEM_DEMO', machine.id, 'Executed factory failure demonstration on CNC-01');

  res.json({
    message: 'Factory failure demonstration initiated successfully.',
    machineCode: machine.machine_code,
    ticketCode,
    planCode: recoveryAnalysis.planCode,
    planId: recoveryAnalysis.planId,
    recoveryAnalysis,
  });
});

app.post('/api/admin/demo-environment/reset', requireAuth, requireRoles('ADMIN', 'MANAGER'), (req, res) => {
  const machine = db.prepare(`SELECT * FROM machines WHERE machine_code = 'CNC-01'`).get() as any;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    if (machine) {
      db.prepare(`UPDATE machines SET status = 'OPERATING', updated_at = ? WHERE id = ?`).run(now, machine.id);
    }
    db.prepare(`UPDATE maintenance_requests SET status = 'COMPLETED', updated_at = ? WHERE ticket_code LIKE 'MNT-DEMO%'`).run(now);
    db.prepare(`UPDATE recovery_plans SET status = 'STALE' WHERE summary LIKE '%DEMO_FAILURE%' AND status = 'PROPOSED'`).run();
    db.prepare(`UPDATE operational_events SET status = 'RESOLVED' WHERE description LIKE '%DEMONSTRATION FAULT%'`).run();
  });
  tx();

  createOperationalEvent({
    eventType: 'SYSTEM_DEMO_RESET',
    priority: 'LOW',
    description: `Factory demonstration environment cleanly reset by ${req.user!.fullName}. All systems normal.`,
    entityType: 'SYSTEM',
    responsiblePersonId: req.user!.id,
  });

  createAuditLog(req.user!.id, 'DEMO_RESET', 'SYSTEM_DEMO', req.user!.id, 'Reset demonstration environment to normal operational baseline.');
  res.json({ message: 'Demonstration environment successfully reset to normal operating state.' });
});

// ============================================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
// ============================================================================
async function startServer() {
  const PORT = Number(process.env.PORT) || 5173;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FactoryPulse IntelliOps server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
