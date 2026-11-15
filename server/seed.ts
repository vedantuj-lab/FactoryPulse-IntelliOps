import { db, hashPassword, initSchema, uuid } from './db.js';

export function getDemoSeedPassword(): string {
  return process.env.DEMO_DEFAULT_PASSWORD || 'DemoPulse!2026';
}

export function seedIfEmpty(): void {
  initSchema();

  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const demoPassHash = hashPassword(getDemoSeedPassword());

  const runSeed = db.transaction(() => {
    // 1. Roles
    const roleIds = {
      ADMIN: uuid(),
      MANAGER: uuid(),
      WORKER: uuid(),
      TECHNICIAN: uuid(),
    };

    const insertRole = db.prepare('INSERT INTO roles (id, name, description, created_at) VALUES (?, ?, ?, ?)');
    insertRole.run(roleIds.ADMIN, 'ADMIN', 'Factory configuration, user provisioning, skills & audit governance', now);
    insertRole.run(roleIds.MANAGER, 'MANAGER', 'Day-to-day factory operations, shift planning, production & recovery approval', now);
    insertRole.run(roleIds.WORKER, 'WORKER', 'Assigned shift execution, attendance, production task updates & fault reporting', now);
    insertRole.run(roleIds.TECHNICIAN, 'TECHNICIAN', 'Preventive & corrective machine maintenance, diagnostics & repair logs', now);

    // 2. Factory
    const factoryId = uuid();
    db.prepare(`
      INSERT INTO factories (id, factory_code, name, location, contact_email, contact_phone, operating_hours, alert_threshold_pct, maint_reminder_days, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      factoryId,
      'FAC-NMW-01',
      'Northstar Manufacturing Works',
      'Sector 14 Industrial Corridor, Pune Metropolitan Region',
      'ops-control@northstar-mfg.demo',
      '+91 20 6712 8400',
      '24x6 Three-Shift Continuous (06:00–14:00, 14:00–22:00, 22:00–06:00)',
      85,
      14,
      now,
      now
    );

    // 3. Departments (5 departments)
    const deptDefs = [
      { code: 'DEPT-ASM', name: 'Assembly', eff: 92 },
      { code: 'DEPT-WLD', name: 'Welding', eff: 89 },
      { code: 'DEPT-PKG', name: 'Packaging', eff: 94 },
      { code: 'DEPT-QCL', name: 'Quality Control', eff: 96 },
      { code: 'DEPT-MNT', name: 'Maintenance', eff: 90 },
    ];
    const deptIds: Record<string, string> = {};
    const insertDept = db.prepare(`
      INSERT INTO departments (id, factory_id, code, name, manager_id, target_efficiency_pct, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `);
    for (const d of deptDefs) {
      const id = uuid();
      deptIds[d.name] = id;
      insertDept.run(id, factoryId, d.code, d.name, d.eff, now);
    }

    // 4. Skills
    const skillDefs = [
      { code: 'CNC_MILLING', name: '5-Axis CNC Milling & Precision Machining', category: 'Machining', desc: 'Operation and tool-offset verification on multi-axis CNC machining centers' },
      { code: 'ROBOTIC_WELD', name: 'Robotic MIG/TIG Arc Welding', category: 'Fabrication', desc: 'Structural weld seam programming, fixture setup, and bead inspection' },
      { code: 'PRECISION_ASSY', name: 'Torque-Calibrated Subassembly', category: 'Assembly', desc: 'Mechanical powertrain and actuator assembly with digital torque verification' },
      { code: 'AUTO_PACK', name: 'Automated Palletizing & Packaging', category: 'Packaging', desc: 'High-speed carton sealing, barcode serialization, and export crating' },
      { code: 'CMM_METROLOGY', name: 'CMM Dimensional Quality Inspection', category: 'Quality', desc: 'Coordinate measuring machine tolerances and ISO 9001 lot verification' },
      { code: 'HYDRAULIC_PRESS', name: 'Heavy Hydraulic Stamping & Forming', category: 'Machining', desc: 'High-tonnage sheet metal forming and die alignment' },
    ];
    const skillIds: Record<string, string> = {};
    const insertSkill = db.prepare('INSERT INTO skills (id, code, name, category, description) VALUES (?, ?, ?, ?, ?)');
    for (const s of skillDefs) {
      const id = uuid();
      skillIds[s.code] = id;
      insertSkill.run(id, s.code, s.name, s.category, s.desc);
    }

    // 5. Primary Demo Users + Additional Managers & Technicians
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, employee_code, role_id, department_id, is_active, phone, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)
    `);

    const adminUserId = uuid();
    insertUser.run(adminUserId, 'admin@factorypulse.demo', demoPassHash, 'Vikramaditya Deshmukh', 'EMP-ADM-001', roleIds.ADMIN, deptIds['Assembly'], '+91 98201 11001', now, now);

    // 4 Managers (including primary manager@factorypulse.demo)
    const managerDefs = [
      { email: 'manager@factorypulse.demo', name: 'Ananya Kulkarni', code: 'EMP-MGR-001', dept: 'Assembly', phone: '+91 98201 22001' },
      { email: 'welding.mgr@factorypulse.demo', name: 'Rajeshwar Nair', code: 'EMP-MGR-002', dept: 'Welding', phone: '+91 98201 22002' },
      { email: 'packaging.mgr@factorypulse.demo', name: 'Meera Sundaram', code: 'EMP-MGR-003', dept: 'Packaging', phone: '+91 98201 22003' },
      { email: 'quality.mgr@factorypulse.demo', name: 'Siddharth Malhotra', code: 'EMP-MGR-004', dept: 'Quality Control', phone: '+91 98201 22004' },
    ];
    const managerIds: string[] = [];
    for (const m of managerDefs) {
      const id = uuid();
      managerIds.push(id);
      insertUser.run(id, m.email, demoPassHash, m.name, m.code, roleIds.MANAGER, deptIds[m.dept], m.phone, now, now);
      db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(id, deptIds[m.dept]);
    }

    // 5 Maintenance Technicians (including primary technician@factorypulse.demo)
    const techDefs = [
      { email: 'technician@factorypulse.demo', name: 'Harpreet Singh Gill', code: 'EMP-TEC-001', phone: '+91 98201 44001' },
      { email: 'tech.kiran@factorypulse.demo', name: 'Kiranmayi Rao', code: 'EMP-TEC-002', phone: '+91 98201 44002' },
      { email: 'tech.farhan@factorypulse.demo', name: 'Farhan Qureshi', code: 'EMP-TEC-003', phone: '+91 98201 44003' },
      { email: 'tech.debasis@factorypulse.demo', name: 'Debasis Chatterjee', code: 'EMP-TEC-004', phone: '+91 98201 44004' },
      { email: 'tech.prakash@factorypulse.demo', name: 'Prakash Joshi', code: 'EMP-TEC-005', phone: '+91 98201 44005' },
    ];
    const techIds: string[] = [];
    for (const t of techDefs) {
      const id = uuid();
      techIds.push(id);
      insertUser.run(id, t.email, demoPassHash, t.name, t.code, roleIds.TECHNICIAN, deptIds['Maintenance'], t.phone, now, now);
    }
    db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(managerIds[0], deptIds['Maintenance']);

    // 6. 12 Machines across departments
    const machineDefs = [
      { code: 'MCH-CNC-101', name: 'DMG Mori 5-Axis CNC Center A1', type: 'CNC Machining', dept: 'Assembly', status: 'OPERATING', cap: 42, util: 88, skill: 'CNC_MILLING', cert: 'ISO Precision Machining L2', instr: 'Verify coolant pressure >= 6.2 bar and spindle warm-up cycle before batch run.' },
      { code: 'MCH-CNC-102', name: 'Mazak Integrex CNC Mill-Turn A2', type: 'CNC Machining', dept: 'Assembly', status: 'IDLE', cap: 40, util: 34, skill: 'CNC_MILLING', cert: 'ISO Precision Machining L2', instr: 'Compatible backup unit for A1/A3 precision housings. Check zero-point clamping.' },
      { code: 'MCH-ASSY-103', name: 'Bosch Rexroth Torque Line B1', type: 'Assembly Line', dept: 'Assembly', status: 'OPERATING', cap: 65, util: 91, skill: 'PRECISION_ASSY', cert: 'Torque Calibration Safety', instr: 'Scan subassembly serial before multi-spindle nutrunner engagement.' },
      { code: 'MCH-ASSY-104', name: 'Atlas Copco Subassembly Cell B2', type: 'Assembly Line', dept: 'Assembly', status: 'OPERATING', cap: 60, util: 82, skill: 'PRECISION_ASSY', cert: 'Torque Calibration Safety', instr: 'Maintain ESD wrist-strap grounding throughout actuator housing build.' },
      { code: 'MCH-WLD-201', name: 'ABB IRB-2600 Robotic Weld Bay W1', type: 'Robotic Welding', dept: 'Welding', status: 'FAULT', cap: 35, util: 0, skill: 'ROBOTIC_WELD', cert: 'AWS Certified Robotic Welder', instr: 'Ensure fume extraction hood interlock is sealed prior to arc ignition.' },
      { code: 'MCH-WLD-202', name: 'Fanuc ArcMate Weld Cell W2', type: 'Robotic Welding', dept: 'Welding', status: 'IDLE', cap: 36, util: 40, skill: 'ROBOTIC_WELD', cert: 'AWS Certified Robotic Welder', instr: 'Verify shielding gas Ar/CO2 82/18 mix flow at 18 L/min.' },
      { code: 'MCH-WLD-203', name: 'Fronius Seam Welder Station W3', type: 'Robotic Welding', dept: 'Welding', status: 'OPERATING', cap: 32, util: 86, skill: 'ROBOTIC_WELD', cert: 'AWS Certified Robotic Welder', instr: 'Inspect wire feeder liner every 16 operating hours.' },
      { code: 'MCH-PRS-204', name: 'Schuler 400T Hydraulic Press P1', type: 'Hydraulic Stamping', dept: 'Welding', status: 'MAINTENANCE', cap: 55, util: 0, skill: 'HYDRAULIC_PRESS', cert: 'Heavy Press Lockout Safety', instr: 'Dual-palm light curtain test mandatory at shift start.' },
      { code: 'MCH-PRS-205', name: 'Komatsu Servo Stamping Press P2', type: 'Hydraulic Stamping', dept: 'Assembly', status: 'OPERATING', cap: 58, util: 79, skill: 'HYDRAULIC_PRESS', cert: 'Heavy Press Lockout Safety', instr: 'Verify die lubrication mist nozzle clearance before continuous stroke.' },
      { code: 'MCH-PKG-301', name: 'Krones Automated Palletizer K1', type: 'Packaging System', dept: 'Packaging', status: 'OPERATING', cap: 95, util: 84, skill: 'AUTO_PACK', cert: 'Automated Line Safety L1', instr: 'Check stretch-wrap film tension and GS1 label thermal ribbon.' },
      { code: 'MCH-PKG-302', name: 'Sidel High-Speed Case Packer K2', type: 'Packaging System', dept: 'Packaging', status: 'IDLE', cap: 90, util: 28, skill: 'AUTO_PACK', cert: 'Automated Line Safety L1', instr: 'Secondary high-speed line available for overflow batch crating.' },
      { code: 'MCH-QCL-401', name: 'Zeiss Contura CMM Optical Rig Q1', type: 'Metrology CMM', dept: 'Quality Control', status: 'OPERATING', cap: 30, util: 76, skill: 'CMM_METROLOGY', cert: 'ISO 9001 Metrology Inspector', instr: 'Maintain enclosure ambient temperature at 20°C ± 0.5°C.' },
    ];

    const machineIds: Record<string, string> = {};
    const insertMachine = db.prepare(`
      INSERT INTO machines (id, factory_id, department_id, machine_code, name, machine_type, status, capacity_units_per_hr, utilization_pct, required_skill_code, required_cert_name, instructions, last_serviced_date, operating_hours_total, idle_hours_total, fault_hours_total, is_demo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    for (const m of machineDefs) {
      const id = uuid();
      machineIds[m.code] = id;
      insertMachine.run(
        id,
        factoryId,
        deptIds[m.dept],
        m.code,
        m.name,
        m.type,
        m.status,
        m.cap,
        m.util,
        m.skill,
        m.cert,
        m.instr,
        '2026-10-18',
        1180 + Math.floor(Math.random() * 350),
        120 + Math.floor(Math.random() * 90),
        m.status === 'FAULT' ? 46 : 14,
        now
      );
    }

    // 7. 30 Workers (First worker is primary worker@factorypulse.demo)
    const workerNames = [
      'Rohan Suryavanshi', 'PriyaDarshini Iyer', 'ArjunShekhar Patil', 'Kavita Choudhary', 'ManojKumar Verma',
      'Snehalata Gokhale', 'Deepak Bhosale', 'Nandini Rajagopal', 'Sureshwar Yadav', 'Pooja Sawant',
      'Abhishek Tiwari', 'Swati Khandelwal', 'Gaurav Shinde', 'Rekha Nambiar', 'Vivek Pawar',
      'Ashwini Kulkarni', 'Chetan Jadhav', 'Divya Subramanian', 'Nikhil Gaikwad', 'Pallavi Menon',
      'Sachin Sonawane', 'Madhuri Deshpande', 'Tushar Kale', 'Shruti Banerjee', 'Yogesh More',
      'komal Chavan', 'Pranav Oak', 'sonali Borgaonkar', 'amrut Phadke', 'Tejaswini Thakur'
    ];

    const deptRotation = ['Assembly', 'Welding', 'Packaging', 'Quality Control', 'Assembly', 'Welding'];
    const skillByDept: Record<string, string[]> = {
      'Assembly': ['CNC_MILLING', 'PRECISION_ASSY', 'HYDRAULIC_PRESS'],
      'Welding': ['ROBOTIC_WELD', 'HYDRAULIC_PRESS', 'CNC_MILLING'],
      'Packaging': ['AUTO_PACK', 'PRECISION_ASSY'],
      'Quality Control': ['CMM_METROLOGY', 'PRECISION_ASSY'],
    };
    const certBySkill: Record<string, string> = {
      'CNC_MILLING': 'ISO Precision Machining L2',
      'ROBOTIC_WELD': 'AWS Certified Robotic Welder',
      'PRECISION_ASSY': 'Torque Calibration Safety',
      'AUTO_PACK': 'Automated Line Safety L1',
      'CMM_METROLOGY': 'ISO 9001 Metrology Inspector',
      'HYDRAULIC_PRESS': 'Heavy Press Lockout Safety',
    };

    const insertWorker = db.prepare(`
      INSERT INTO workers (id, user_id, department_id, designation, experience_years, availability, assigned_machine_id, is_demo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    const insertWorkerSkill = db.prepare('INSERT INTO worker_skills (id, worker_id, skill_id, proficiency_level) VALUES (?, ?, ?, ?)');
    const insertCert = db.prepare('INSERT INTO certifications (id, worker_id, name, issuing_body, issued_date, expiry_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertAttendance = db.prepare('INSERT INTO attendance (id, worker_id, attendance_date, check_in_time, check_out_time, hours_worked, status) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const workerIds: string[] = [];
    const operatingMachineCodes = ['MCH-CNC-101', 'MCH-ASSY-103', 'MCH-ASSY-104', 'MCH-WLD-201', 'MCH-WLD-203', 'MCH-PRS-205', 'MCH-PKG-301', 'MCH-QCL-401'];

    for (let i = 0; i < 30; i++) {
      const uId = uuid();
      const wId = uuid();
      workerIds.push(wId);

      const cleanName = workerNames[i].charAt(0).toUpperCase() + workerNames[i].slice(1);
      const email = i === 0 ? 'worker@factorypulse.demo' : `worker${String(i + 1).padStart(2, '0')}@factorypulse.demo`;
      const empCode = `EMP-WRK-${String(101 + i)}`;
      const deptName = i === 0 ? 'Welding' : deptRotation[i % deptRotation.length];
      const deptId = deptIds[deptName];

      insertUser.run(uId, email, demoPassHash, cleanName, empCode, roleIds.WORKER, deptId, `+91 98202 ${String(10000 + i)}`, now, now);

      let availability: 'AVAILABLE' | 'ASSIGNED' | 'ABSENT' = 'AVAILABLE';
      let assignedMach: string | null = null;
      if (i < 14) {
        availability = 'ASSIGNED';
        assignedMach = i === 0 ? machineIds['MCH-WLD-201'] : machineIds[operatingMachineCodes[i % operatingMachineCodes.length]];
      } else if (i >= 27) {
        availability = 'ABSENT';
      }

      const designations = ['Senior Line Operator', 'Lead CNC Machinist', 'Robotic Weld Specialist', 'Precision Assembler', 'Quality Technician'];
      insertWorker.run(wId, uId, deptId, i === 0 ? 'Senior Robotic Weld & CNC Operator' : designations[i % designations.length], 2 + (i % 9), availability, assignedMach, now);

      const deptSkills = skillByDept[deptName];
      const primarySkill = i === 0 ? 'ROBOTIC_WELD' : deptSkills[i % deptSkills.length];
      const secondarySkill = i === 0 ? 'CNC_MILLING' : deptSkills[(i + 1) % deptSkills.length];

      insertWorkerSkill.run(uuid(), wId, skillIds[primarySkill], 4 + (i % 2));
      if (secondarySkill !== primarySkill) {
        insertWorkerSkill.run(uuid(), wId, skillIds[secondarySkill], 3 + (i % 3));
      }

      insertCert.run(uuid(), wId, certBySkill[primarySkill], 'National Industrial Safety & Skills Council', '2025-03-10', '2027-03-10', 'VALID');
      if (secondarySkill !== primarySkill) {
        insertCert.run(uuid(), wId, certBySkill[secondarySkill], 'TUV SUD Industrial Certification', '2025-06-01', '2027-06-01', 'VALID');
      }

      // Attendance today
      if (availability !== 'ABSENT') {
        insertAttendance.run(uuid(), wId, today, '06:04', null, 4.8, 'PRESENT');
      } else {
        insertAttendance.run(uuid(), wId, today, null, null, 0, 'ABSENT');
      }
    }

    // 8. 3 Shifts (Morning, Afternoon, Night) + Shift Assignments
    const shiftDefs = [
      { name: 'Morning', dept: 'Assembly', start: '06:00', end: '14:00', req: 8 },
      { name: 'Morning', dept: 'Welding', start: '06:00', end: '14:00', req: 6 },
      { name: 'Afternoon', dept: 'Assembly', start: '14:00', end: '22:00', req: 7 },
      { name: 'Afternoon', dept: 'Packaging', start: '14:00', end: '22:00', req: 5 },
      { name: 'Night', dept: 'Welding', start: '22:00', end: '06:00', req: 5 },
      { name: 'Morning', dept: 'Quality Control', start: '06:00', end: '14:00', req: 4 },
    ];
    const shiftIds: string[] = [];
    const insertShift = db.prepare(`
      INSERT INTO shifts (id, department_id, name, shift_date, start_time, end_time, required_workers, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of shiftDefs) {
      const id = uuid();
      shiftIds.push(id);
      insertShift.run(id, deptIds[s.dept], s.name, today, s.start, s.end, s.req, now);
    }

    const insertShiftAssign = db.prepare('INSERT INTO shift_assignments (id, shift_id, worker_id, status, created_at) VALUES (?, ?, ?, ?, ?)');
    // Assign first 24 active workers cleanly across non-overlapping shifts
    for (let i = 0; i < 24; i++) {
      const shiftId = i === 0 ? shiftIds[1] : shiftIds[i % shiftIds.length];
      insertShiftAssign.run(uuid(), shiftId, workerIds[i], 'SCHEDULED', now);
    }

    // 9. 10 Production Orders & 20 Production Tasks
    const orderDefs = [
      { code: 'PO-2026-801', dept: 'Welding', mach: 'MCH-WLD-201', prod: 'EV Battery Chassis Subframe Weldment', target: 240, done: 112, down: 95, prio: 'CRITICAL', status: 'DELAYED', due: today },
      { code: 'PO-2026-802', dept: 'Assembly', mach: 'MCH-CNC-101', prod: 'Precision Planetary Gearbox Housing', target: 320, done: 268, down: 10, prio: 'HIGH', status: 'IN_PROGRESS', due: today },
      { code: 'PO-2026-803', dept: 'Assembly', mach: 'MCH-ASSY-103', prod: 'Servo Actuator Drive Module Rev-C', target: 500, done: 410, down: 0, prio: 'HIGH', status: 'IN_PROGRESS', due: today },
      { code: 'PO-2026-804', dept: 'Welding', mach: 'MCH-WLD-203', prod: 'Heavy Commercial Axle Bracket Batch', target: 180, done: 145, down: 15, prio: 'MEDIUM', status: 'IN_PROGRESS', due: '2026-11-03' },
      { code: 'PO-2026-805', dept: 'Packaging', mach: 'MCH-PKG-301', prod: 'Export OEM Drivetrain Crate Lot #44', target: 600, done: 600, down: 0, prio: 'MEDIUM', status: 'COMPLETED', due: today },
      { code: 'PO-2026-806', dept: 'Assembly', mach: 'MCH-ASSY-104', prod: 'Hydraulic Valve Manifold Assembly', target: 280, done: 190, down: 12, prio: 'HIGH', status: 'IN_PROGRESS', due: '2026-11-03' },
      { code: 'PO-2026-807', dept: 'Quality Control', mach: 'MCH-QCL-401', prod: 'ISO Lot Dimensional Certification #19', target: 150, done: 150, down: 0, prio: 'HIGH', status: 'COMPLETED', due: today },
      { code: 'PO-2026-808', dept: 'Assembly', mach: 'MCH-PRS-205', prod: 'Stator Laminations Stamped Core Set', target: 450, done: 315, down: 20, prio: 'MEDIUM', status: 'IN_PROGRESS', due: '2026-11-04' },
      { code: 'PO-2026-809', dept: 'Welding', mach: 'MCH-PRS-204', prod: 'Reinforced Bumper Crossmember Batch', target: 300, done: 80, down: 140, prio: 'HIGH', status: 'ON_HOLD', due: '2026-11-04' },
      { code: 'PO-2026-810', dept: 'Packaging', mach: 'MCH-PKG-302', prod: 'Domestic Spare Kit Serialization', target: 400, done: 0, down: 0, prio: 'LOW', status: 'NOT_STARTED', due: '2026-11-05' },
    ];

    const orderIds: string[] = [];
    const insertOrder = db.prepare(`
      INSERT INTO production_orders (id, order_code, factory_id, department_id, machine_id, product_name, target_qty, produced_qty, downtime_mins, priority, status, deadline, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    for (const o of orderDefs) {
      const id = uuid();
      orderIds.push(id);
      insertOrder.run(id, o.code, factoryId, deptIds[o.dept], machineIds[o.mach], o.prod, o.target, o.done, o.down, o.prio, o.status, o.due, now, now);
    }

    const insertTask = db.prepare(`
      INSERT INTO production_tasks (id, order_id, worker_id, machine_id, title, target_qty, completed_qty, status, deadline, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 20 Production Tasks (ensure primary demo worker [workerIds[0]] gets clear active tasks)
    insertTask.run(uuid(), orderIds[0], workerIds[0], machineIds['MCH-WLD-201'], 'Weld Subframe Longitudinal Seam Stage 1', 120, 58, 'IN_PROGRESS', today, now);
    insertTask.run(uuid(), orderIds[1], workerIds[0], machineIds['MCH-CNC-101'], 'Secondary Flange Bore Verification', 80, 64, 'IN_PROGRESS', today, now);

    for (let t = 2; t < 20; t++) {
      const ordIdx = t % orderDefs.length;
      const ord = orderDefs[ordIdx];
      const wIdx = (t % 18) + 1;
      const tTarget = Math.max(40, Math.round(ord.target / 2));
      const tDone = ord.status === 'COMPLETED' ? tTarget : Math.min(tTarget, Math.round(ord.done / 2));
      const tStatus = ord.status === 'COMPLETED' ? 'COMPLETED' : ord.status === 'NOT_STARTED' ? 'NOT_STARTED' : 'IN_PROGRESS';
      insertTask.run(
        uuid(),
        orderIds[ordIdx],
        workerIds[wIdx],
        machineIds[ord.mach],
        `${ord.prod} — Operation Batch #${t + 1}`,
        tTarget,
        tDone,
        tStatus,
        ord.due,
        now
      );
    }

    // Historical Production Logs (7 days for trend charts)
    const insertProdLog = db.prepare(`
      INSERT INTO production_logs (id, order_id, recorded_by_id, output_delta, downtime_mins, notes, log_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const pastDays = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', today];
    const dailyTotals = [410, 445, 430, 478, 462, 490, 395];
    const dailyDowntime = [28, 18, 35, 14, 22, 12, 95];
    for (let d = 0; d < pastDays.length; d++) {
      insertProdLog.run(
        uuid(),
        orderIds[d % orderIds.length],
        managerIds[0],
        dailyTotals[d],
        dailyDowntime[d],
        `Shift consolidated output log (${pastDays[d]}) [Demonstration Dataset]`,
        pastDays[d],
        `${pastDays[d]}T14:00:00.000Z`
      );
    }

    // 10. Safety Incidents & Corrective Actions
    const insertSafety = db.prepare(`
      INSERT INTO safety_incidents (id, incident_code, department_id, reported_by_id, incident_type, category, severity, description, status, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const inc1 = uuid();
    const inc2 = uuid();
    const inc3 = uuid();
    const workerZeroUser = db.prepare('SELECT user_id FROM workers WHERE id = ?').get(workerIds[0]) as { user_id: string };

    insertSafety.run(inc1, 'SAF-2026-041', deptIds['Welding'], workerZeroUser.user_id, 'HAZARD', 'Fume Extraction & Ventilation', 'HIGH', 'Reduced suction pressure observed on Weld Bay W1 extraction damper during continuous seam cycle.', 'ACTION_ASSIGNED', now, null);
    insertSafety.run(inc2, 'SAF-2026-042', deptIds['Assembly'], managerIds[0], 'HAZARD', 'Floor Coolant Spill', 'MEDIUM', 'Minor synthetic coolant mist accumulation near CNC-101 chip conveyor.', 'OPEN', now, null);
    insertSafety.run(inc3, 'SAF-2026-039', deptIds['Packaging'], managerIds[2], 'INCIDENT', 'Forklift Aisle Clearance', 'LOW', 'Pallet staging encroached pedestrian yellow walkway line in Bay K1; cleared immediately.', 'RESOLVED', '2026-10-30T10:15:00.000Z', '2026-10-30T15:30:00.000Z');

    db.prepare(`
      INSERT INTO safety_actions (id, incident_id, assigned_to_id, action_plan, deadline, status, completed_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', NULL)
    `).run(uuid(), inc1, techIds[0], 'Inspect damper actuator relay and replace HEPA spark arrestor cartridge on Bay W1.', today);

    // 11. Maintenance Requests, Schedules & Service Logs
    const insertMaint = db.prepare(`
      INSERT INTO maintenance_requests (id, request_code, machine_id, reported_by_id, assigned_tech_id, fault_category, priority, description, diagnosis, repair_notes, parts_used, status, scheduled_date, downtime_minutes, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const req1 = uuid();
    const req2 = uuid();
    const req3 = uuid();
    const req4 = uuid();

    insertMaint.run(
      req1,
      'MNT-2026-301',
      machineIds['MCH-WLD-201'],
      workerZeroUser.user_id,
      techIds[0],
      'Servo Torch Drive Fault',
      'CRITICAL',
      'ABB IRB-2600 Axis-4 wrist servo overcurrent alarm (Code E-408); weld arc halted mid-batch on PO-2026-801.',
      'Axis-4 harmonic drive encoder cable thermal degradation detected.',
      null,
      null,
      'ASSIGNED',
      today,
      95,
      now,
      null
    );

    insertMaint.run(
      req2,
      'MNT-2026-302',
      machineIds['MCH-PRS-204'],
      managerIds[1],
      techIds[0],
      'Hydraulic Proportional Valve',
      'HIGH',
      'Pressure ripple exceeding ±4 bar on 400T main cylinder.',
      'Proportional directional valve spool wear; seal kit replacement underway.',
      'Flushed hydraulic circuit and fitted Parker seal kit SK-400.',
      'Parker Proportional Seal Kit #PK-400B, 20L ISO VG-46 Hydraulic Oil',
      'IN_PROGRESS',
      today,
      140,
      now,
      null
    );

    insertMaint.run(
      req3,
      'MNT-2026-298',
      machineIds['MCH-CNC-101'],
      managerIds[0],
      techIds[1],
      'Spindle Chiller Calibration',
      'MEDIUM',
      'Scheduled spindle thermal drift check and drawbar force test.',
      'Drawbar clamping force within spec (18.4 kN). Cleaned chiller condenser fins.',
      'Completed preventive calibration; zero fault codes.',
      'Filter pad FP-12',
      'COMPLETED',
      '2026-10-29',
      35,
      '2026-10-29T08:00:00.000Z',
      '2026-10-29T10:15:00.000Z'
    );

    insertMaint.run(
      req4,
      'MNT-2026-295',
      machineIds['MCH-PKG-301'],
      managerIds[2],
      techIds[0],
      'Pneumatic Gripper Sensor',
      'HIGH',
      'Intermittent reed-switch timeout on palletizer layer head.',
      'Loose M8 sensor connector on gantry axis.',
      null,
      null,
      'REPORTED',
      '2026-10-31',
      25,
      '2026-10-31T09:00:00.000Z',
      null
    );

    const insertSchedule = db.prepare(`
      INSERT INTO maintenance_schedules (id, machine_id, technician_id, title, scheduled_date, duration_hrs, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertSchedule.run(uuid(), machineIds['MCH-CNC-102'], techIds[0], '500-Hour Ballscrew Lubrication & Backlash Check', '2026-11-04', 2.5, 'SCHEDULED');
    insertSchedule.run(uuid(), machineIds['MCH-ASSY-103'], techIds[1], 'Multi-Spindle Torque Transducer Recertification', '2026-11-06', 3.0, 'SCHEDULED');
    insertSchedule.run(uuid(), machineIds['MCH-WLD-203'], techIds[0], 'Wire Feeder Liner & Contact Tip Overhaul', '2026-10-30', 1.5, 'OVERDUE');

    // Machine Status Log
    db.prepare(`
      INSERT INTO machine_status_logs (id, machine_id, previous_status, new_status, changed_by_id, reason, created_at)
      VALUES (?, ?, 'OPERATING', 'FAULT', ?, 'Worker fault report MNT-2026-301: Axis-4 servo overcurrent on MCH-WLD-201', ?)
    `).run(uuid(), machineIds['MCH-WLD-201'], workerZeroUser.user_id, now);

    // Notifications for all 4 demo accounts
    const insertNotif = db.prepare(`
      INSERT INTO notifications (id, user_id, category, title, message, related_link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);
    insertNotif.run(uuid(), managerIds[0], 'FAULT', 'Critical Machine Fault: MCH-WLD-201', 'ABB IRB-2600 Robotic Weld Bay W1 halted on PO-2026-801. Intelligent Recovery Engine has eligible backup capacity ready for review.', '/manager/recovery-engine', now);
    insertNotif.run(uuid(), managerIds[0], 'SAFETY', 'High-Severity Safety Hazard SAF-2026-041', 'Ventilation damper suction drop reported in Welding department.', '/manager/dashboard?tab=safety', now);
    insertNotif.run(uuid(), techIds[0], 'MAINTENANCE', 'Critical Fault Assigned: MNT-2026-301', 'Inspect ABB IRB-2600 Axis-4 servo alarm in Welding Bay W1.', '/technician/dashboard', now);
    insertNotif.run(uuid(), workerZeroUser.user_id, 'TASK', 'Shift & Production Assignment Active', 'Assigned to Morning Shift (06:00–14:00) on PO-2026-801. Fault report MNT-2026-301 logged and routed to Maintenance.', '/worker/dashboard', now);
    insertNotif.run(uuid(), adminUserId, 'SYSTEM', 'Northstar Manufacturing Works Seed Initialized', 'Demonstration dataset active: 1 Factory, 5 Departments, 30 Workers, 12 Machines, and 10 Production Orders verified.', '/admin/dashboard', now);

    // Initial Audit Logs
    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run(uuid(), adminUserId, 'FACTORY_INITIALIZED', 'FACTORY', factoryId, 'Configured Northstar Manufacturing Works (FAC-NMW-01) with 5 operational departments [Demonstration Seed]', now);
    insertAudit.run(uuid(), workerZeroUser.user_id, 'FAULT_REPORTED', 'MACHINE', machineIds['MCH-WLD-201'], 'Reported CRITICAL fault MNT-2026-301 on ABB IRB-2600 Robotic Weld Bay W1', now);
    insertAudit.run(uuid(), managerIds[0], 'PRODUCTION_SCHEDULED', 'PRODUCTION_ORDER', orderIds[0], 'Dispatched critical order PO-2026-801 (EV Battery Chassis Subframe Weldment, 240 units)', now);
  });

  runSeed();
}

// Allow running `npm run seed` directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedIfEmpty();
  console.log('FactoryPulse IntelliOps demonstration dataset verified and seeded.');
}
