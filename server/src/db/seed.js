/**
 * Seeds the database with a realistic demo dataset:
 * organization, department hierarchy, users of every role,
 * categories, assets across all lifecycle states, allocations,
 * transfers, bookings, maintenance, an audit cycle, notifications
 * and activity logs.
 *
 * Idempotent-ish: wipes existing rows first (dev convenience).
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../config/db.js';

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const pick = (arr, i) => arr[i % arr.length];

async function seed() {
  const passwordHash = await bcrypt.hash('Password@123', 10);
  const adminHash = await bcrypt.hash('Admin@123', 10);

  await withTransaction(async (c) => {
    console.log('Clearing existing data…');
    // activity_logs is immutable at row level; TRUNCATE bypasses row triggers.
    await c.query(`TRUNCATE organization, departments, users, password_resets, asset_categories,
      assets, asset_status_history, allocations, transfers, bookings, maintenance_requests,
      audits, audit_items, activity_logs, notifications RESTART IDENTITY CASCADE`);

    console.log('Seeding organization…');
    await c.query(
      `INSERT INTO organization (id, name, legal_name, email, phone, address, city, country, timezone, currency, asset_tag_prefix)
       VALUES (1, 'AssetFlow Corp', 'AssetFlow Technologies Pvt. Ltd.', 'ops@assetflow.io', '+91 98765 43210',
               'Tower B, Cyber Park', 'Gandhinagar', 'India', 'Asia/Kolkata', 'INR', 'AST')`
    );

    console.log('Seeding departments…');
    const dept = async (name, code, description, parentId = null) => {
      const r = await c.query(
        `INSERT INTO departments (name, code, description, parent_id) VALUES ($1,$2,$3,$4) RETURNING id`,
        [name, code, description, parentId]
      );
      return r.rows[0].id;
    };
    const dEng = await dept('Engineering', 'ENG', 'Product engineering and platform teams');
    const dFrontend = await dept('Frontend', 'ENG-FE', 'Web and mobile clients', dEng);
    const dBackend = await dept('Backend', 'ENG-BE', 'APIs, services and infrastructure', dEng);
    const dOps = await dept('Operations', 'OPS', 'Facilities, logistics and administration');
    const dHR = await dept('Human Resources', 'HR', 'People operations and recruitment');
    const dFin = await dept('Finance', 'FIN', 'Accounting, payroll and procurement');
    const dSales = await dept('Sales & Marketing', 'SLS', 'Revenue and brand teams');

    console.log('Seeding users…');
    let empSeq = 0;
    const user = async (fullName, email, role, departmentId, designation, hash = passwordHash) => {
      empSeq += 1;
      const r = await c.query(
        `INSERT INTO users (employee_code, full_name, email, password_hash, role, department_id, designation, avatar_color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [`EMP-${String(empSeq).padStart(4, '0')}`, fullName, email, hash, role, departmentId, designation, pick(AVATAR_COLORS, empSeq)]
      );
      return r.rows[0].id;
    };

    const admin = await user('Aarav Sharma', 'admin@assetflow.io', 'ADMIN', dOps, 'System Administrator', adminHash);
    const manager = await user('Priya Patel', 'manager@assetflow.io', 'ASSET_MANAGER', dOps, 'Asset Manager');
    const headEng = await user('Rohan Mehta', 'rohan.mehta@assetflow.io', 'DEPARTMENT_HEAD', dEng, 'VP Engineering');
    const headHR = await user('Kavya Nair', 'kavya.nair@assetflow.io', 'DEPARTMENT_HEAD', dHR, 'HR Director');
    const headSales = await user('Arjun Reddy', 'arjun.reddy@assetflow.io', 'DEPARTMENT_HEAD', dSales, 'Sales Director');
    const e1 = await user('Ishaan Gupta', 'ishaan.gupta@assetflow.io', 'EMPLOYEE', dFrontend, 'Frontend Engineer');
    const e2 = await user('Sneha Iyer', 'sneha.iyer@assetflow.io', 'EMPLOYEE', dBackend, 'Backend Engineer');
    const e3 = await user('Vikram Singh', 'vikram.singh@assetflow.io', 'EMPLOYEE', dBackend, 'DevOps Engineer');
    const e4 = await user('Ananya Desai', 'ananya.desai@assetflow.io', 'EMPLOYEE', dHR, 'HR Executive');
    const e5 = await user('Karan Malhotra', 'karan.malhotra@assetflow.io', 'EMPLOYEE', dSales, 'Account Executive');
    const e6 = await user('Meera Joshi', 'meera.joshi@assetflow.io', 'EMPLOYEE', dFin, 'Financial Analyst');
    const e7 = await user('Aditya Kulkarni', 'aditya.k@assetflow.io', 'EMPLOYEE', dFrontend, 'UI Engineer');

    await c.query(`UPDATE departments SET head_id=$1 WHERE id=$2`, [headEng, dEng]);
    await c.query(`UPDATE departments SET head_id=$1 WHERE id=$2`, [headHR, dHR]);
    await c.query(`UPDATE departments SET head_id=$1 WHERE id=$2`, [headSales, dSales]);
    await c.query(`UPDATE departments SET head_id=$1 WHERE id=$2`, [manager, dOps]);

    console.log('Seeding categories…');
    const cat = async (name, code, description, lifespan, bookable = false) => {
      const r = await c.query(
        `INSERT INTO asset_categories (name, code, description, expected_lifespan_months, is_bookable_default)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [name, code, description, lifespan, bookable]
      );
      return r.rows[0].id;
    };
    const cLaptop = await cat('Laptops', 'LAP', 'Portable workstations and ultrabooks', 48);
    const cMonitor = await cat('Monitors', 'MON', 'External displays', 60);
    const cPhone = await cat('Mobile Devices', 'MOB', 'Company phones and tablets', 36);
    const cFurniture = await cat('Furniture', 'FUR', 'Desks, chairs and storage', 120);
    const cRoom = await cat('Meeting Rooms', 'ROOM', 'Bookable conference and huddle rooms', null, true);
    const cVehicle = await cat('Vehicles', 'VEH', 'Company cars and delivery vans', 96, true);
    const cEquip = await cat('AV Equipment', 'AVE', 'Projectors, cameras and audio gear', 60, true);

    console.log('Seeding assets…');
    let tagSeq = 1000;
    const asset = async (o) => {
      tagSeq += 1;
      const r = await c.query(
        `INSERT INTO assets (asset_tag, name, category_id, department_id, serial_number, model, manufacturer,
           purchase_date, purchase_cost, warranty_expiry, condition, status, location, is_bookable, created_by, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'AVAILABLE',$12,$13,$14,$15) RETURNING id`,
        [`AST-${tagSeq}`, o.name, o.category, o.department ?? null, o.serial ?? null, o.model ?? null,
         o.manufacturer ?? null, o.purchaseDate ?? null, o.cost ?? null, o.warranty ?? null,
         o.condition ?? 'GOOD', o.location ?? 'HQ — Gandhinagar', o.bookable ?? false, admin, o.notes ?? null]
      );
      await c.query(
        `INSERT INTO asset_status_history (asset_id, from_status, to_status, changed_by, reason)
         VALUES ($1, NULL, 'AVAILABLE', $2, 'Asset registered')`,
        [r.rows[0].id, admin]
      );
      return r.rows[0].id;
    };
    const setStatus = async (assetId, to, by, reason) => {
      const prev = (await c.query(`SELECT status FROM assets WHERE id=$1`, [assetId])).rows[0].status;
      await c.query(`UPDATE assets SET status=$1 WHERE id=$2`, [to, assetId]);
      await c.query(
        `INSERT INTO asset_status_history (asset_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)`,
        [assetId, prev, to, by, reason]
      );
    };

    const mbp1 = await asset({ name: 'MacBook Pro 14" M3', category: cLaptop, department: dFrontend, serial: 'C02XR1ZLMD6T', model: 'MacBook Pro 14 (2024)', manufacturer: 'Apple', purchaseDate: '2024-03-15', cost: 189900, warranty: '2027-03-15', condition: 'NEW' });
    const mbp2 = await asset({ name: 'MacBook Pro 16" M3 Max', category: cLaptop, department: dBackend, serial: 'C02YT2AKMD7U', model: 'MacBook Pro 16 (2024)', manufacturer: 'Apple', purchaseDate: '2024-01-20', cost: 349900, warranty: '2027-01-20' });
    const dell1 = await asset({ name: 'Dell XPS 15', category: cLaptop, department: dBackend, serial: 'DXPS15-88121', model: 'XPS 9530', manufacturer: 'Dell', purchaseDate: '2023-08-10', cost: 165000, warranty: '2026-08-10' });
    const dell2 = await asset({ name: 'Dell Latitude 7440', category: cLaptop, department: dHR, serial: 'DLAT-44029', model: 'Latitude 7440', manufacturer: 'Dell', purchaseDate: '2023-05-02', cost: 98000, warranty: '2026-05-02' });
    const think1 = await asset({ name: 'ThinkPad X1 Carbon G11', category: cLaptop, department: dSales, serial: 'LNV-X1C-3321', model: 'X1 Carbon Gen 11', manufacturer: 'Lenovo', purchaseDate: '2023-11-25', cost: 142000, warranty: '2026-11-25' });
    const think2 = await asset({ name: 'ThinkPad T14s', category: cLaptop, department: dFin, serial: 'LNV-T14S-990', model: 'T14s Gen 4', manufacturer: 'Lenovo', purchaseDate: '2022-04-18', cost: 105000, warranty: '2025-04-18', condition: 'FAIR' });
    const oldMac = await asset({ name: 'MacBook Air 2019', category: cLaptop, department: dOps, serial: 'C02ZH0AJLV2F', model: 'MacBook Air 13 (2019)', manufacturer: 'Apple', purchaseDate: '2019-09-01', cost: 99900, warranty: '2022-09-01', condition: 'POOR', notes: 'Battery service recommended; nearing end of life.' });

    const mon1 = await asset({ name: 'LG UltraFine 27" 4K', category: cMonitor, department: dFrontend, serial: 'LGUF27-55310', model: '27UN850', manufacturer: 'LG', purchaseDate: '2024-02-01', cost: 42000, warranty: '2027-02-01' });
    const mon2 = await asset({ name: 'Dell UltraSharp 32"', category: cMonitor, department: dBackend, serial: 'DUS32-77482', model: 'U3223QE', manufacturer: 'Dell', purchaseDate: '2023-10-12', cost: 68000, warranty: '2026-10-12' });
    await asset({ name: 'Samsung ViewFinity 27"', category: cMonitor, department: dHR, serial: 'SVF27-11220', model: 'S80PB', manufacturer: 'Samsung', purchaseDate: '2024-06-05', cost: 35000, warranty: '2027-06-05', condition: 'NEW' });

    const ip1 = await asset({ name: 'iPhone 15 Pro', category: cPhone, department: dSales, serial: 'IP15P-40021', model: 'iPhone 15 Pro 256GB', manufacturer: 'Apple', purchaseDate: '2024-04-22', cost: 134900, warranty: '2025-04-22', condition: 'NEW' });
    const ip2 = await asset({ name: 'Samsung Galaxy S24', category: cPhone, department: dSales, serial: 'SGS24-88472', model: 'Galaxy S24 Ultra', manufacturer: 'Samsung', purchaseDate: '2024-05-30', cost: 129900, warranty: '2025-05-30' });
    await asset({ name: 'iPad Pro 12.9"', category: cPhone, department: dEng, serial: 'IPADP-66301', model: 'iPad Pro M2', manufacturer: 'Apple', purchaseDate: '2023-07-14', cost: 112900, warranty: '2024-07-14' });

    await asset({ name: 'Herman Miller Aeron', category: cFurniture, department: dEng, serial: 'HMA-2210-45', model: 'Aeron Remastered', manufacturer: 'Herman Miller', purchaseDate: '2022-01-10', cost: 125000 });
    await asset({ name: 'Standing Desk Pro', category: cFurniture, department: dEng, serial: 'SDP-8817', model: 'Jarvis Bamboo', manufacturer: 'Fully', purchaseDate: '2022-06-20', cost: 55000 });

    const room1 = await asset({ name: 'Conference Room — Everest', category: cRoom, department: dOps, location: '3rd Floor, East Wing', bookable: true, notes: 'Seats 14. Video wall + Polycom.' });
    const room2 = await asset({ name: 'Huddle Room — Nilgiri', category: cRoom, department: dOps, location: '2nd Floor, West Wing', bookable: true, notes: 'Seats 4. Whiteboard + 55" display.' });
    const room3 = await asset({ name: 'Board Room — Himalaya', category: cRoom, department: dOps, location: '5th Floor', bookable: true, notes: 'Seats 20. Executive AV suite.' });
    const car1 = await asset({ name: 'Toyota Innova Crysta', category: cVehicle, department: dOps, serial: 'MH12-KL-3344', model: 'Innova Crysta ZX', manufacturer: 'Toyota', purchaseDate: '2022-09-15', cost: 2600000, bookable: true, location: 'Basement Parking B1' });
    const proj1 = await asset({ name: 'Epson 4K Projector', category: cEquip, department: dOps, serial: 'EPS4K-1102', model: 'EH-TW7100', manufacturer: 'Epson', purchaseDate: '2023-03-08', cost: 185000, warranty: '2026-03-08', bookable: true });
    const cam1 = await asset({ name: 'Sony A7 IV Kit', category: cEquip, department: dSales, serial: 'SNYA7-4419', model: 'ILCE-7M4', manufacturer: 'Sony', purchaseDate: '2023-12-01', cost: 262000, warranty: '2025-12-01', bookable: true });

    console.log('Seeding allocations…');
    const days = (n) => new Date(Date.now() + n * 86400000);
    const allocate = async (assetId, to, dueInDays, allocatedDaysAgo = 10) => {
      await c.query(
        `INSERT INTO allocations (asset_id, allocated_to, allocated_by, status, allocated_at, due_date, purpose)
         VALUES ($1,$2,$3,'ACTIVE',$4,$5,'Primary work device')`,
        [assetId, to, manager, days(-allocatedDaysAgo), dueInDays === null ? null : days(dueInDays)]
      );
      await setStatus(assetId, 'ALLOCATED', manager, 'Allocated to employee');
    };
    await allocate(mbp1, e1, 180, 90);
    await allocate(mbp2, e2, 365, 120);
    await allocate(dell1, e3, null, 200);
    await allocate(think1, e5, 90, 30);
    await allocate(ip1, headSales, 365, 60);
    await allocate(mon1, e7, 180, 45);
    await allocate(think2, e6, -6, 40);   // overdue return
    await allocate(dell2, e4, -2, 25);    // overdue return

    // A returned allocation for history
    await c.query(
      `INSERT INTO allocations (asset_id, allocated_to, allocated_by, status, allocated_at, due_date, returned_at, return_condition, return_notes, received_by, purpose)
       VALUES ($1,$2,$3,'RETURNED',$4,$5,$6,'GOOD','Returned after project wrap-up',$7,'Project loaner')`,
      [mon2, e1, manager, days(-120), days(-30), days(-28), manager]
    );

    console.log('Seeding transfers…');
    await c.query(
      `INSERT INTO transfers (asset_id, from_user_id, to_user_id, from_department_id, to_department_id, requested_by, status, reason)
       VALUES ($1,$2,$3,$4,$5,$6,'REQUESTED','Ishaan is moving to the platform team and needs the higher-spec machine')`,
      [mbp1, e1, e2, dFrontend, dBackend, headEng]
    );
    await c.query(
      `INSERT INTO transfers (asset_id, from_user_id, to_user_id, from_department_id, to_department_id, requested_by, status, reason, decided_by, decided_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,'COMPLETED','Sales device rotation',$7,$8,$8)`,
      [ip2, null, e5, dOps, dSales, headSales, manager, days(-15)]
    );

    console.log('Seeding bookings…');
    const at = (dayOffset, hour, min = 0) => {
      const d = new Date(Date.now() + dayOffset * 86400000);
      d.setHours(hour, min, 0, 0);
      return d;
    };
    const booking = (assetId, by, purpose, start, end, status = 'UPCOMING', attendees = null) =>
      c.query(
        `INSERT INTO bookings (asset_id, booked_by, purpose, start_time, end_time, status, attendees)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [assetId, by, purpose, start, end, status, attendees]
      );
    await booking(room1, headEng, 'Quarterly engineering all-hands', at(1, 10), at(1, 12), 'UPCOMING', 14);
    await booking(room1, e4, 'New-hire onboarding session', at(1, 14), at(1, 16), 'UPCOMING', 8);
    await booking(room2, e1, 'Design sync with product', at(0, 17), at(0, 18), 'UPCOMING', 4);
    await booking(room3, admin, 'Board review — H1 results', at(3, 9), at(3, 12), 'UPCOMING', 18);
    await booking(car1, e5, 'Client visit — Agromax factory tour', at(2, 8), at(2, 18), 'UPCOMING');
    await booking(proj1, headSales, 'Sales kickoff presentation', at(-7, 9), at(-7, 17), 'COMPLETED');
    await booking(room2, e2, 'API design review', at(-2, 11), at(-2, 12), 'COMPLETED', 5);
    await booking(room3, headHR, 'Cancelled town hall', at(4, 15), at(4, 17), 'CANCELLED');

    console.log('Seeding maintenance…');
    await c.query(
      `INSERT INTO maintenance_requests (asset_id, requested_by, title, description, type, priority, status)
       VALUES ($1,$2,'Battery drains within 2 hours','Battery health at 61%; needs replacement.','CORRECTIVE','HIGH','PENDING')`,
      [oldMac, e3]
    );
    await c.query(
      `INSERT INTO maintenance_requests (asset_id, requested_by, title, description, type, priority, status, decided_by, decided_at, technician_name, assigned_at, started_at, scheduled_date)
       VALUES ($1,$2,'Projector lamp flickering','Lamp flickers after ~30 min of use.','CORRECTIVE','MEDIUM','IN_PROGRESS',$3,$4,'Rakesh (CoolTech AV Services)',$4,$4, CURRENT_DATE)`,
      [proj1, e4, manager, days(-2)]
    );
    await setStatus(proj1, 'UNDER_MAINTENANCE', manager, 'Maintenance approved: projector lamp flickering');
    await c.query(
      `INSERT INTO maintenance_requests (asset_id, requested_by, title, description, type, priority, status, decided_by, decided_at, technician_name, assigned_at, started_at, resolved_at, resolution_notes, cost)
       VALUES ($1,$2,'Annual service','Scheduled preventive service.','PREVENTIVE','LOW','RESOLVED',$3,$4,$5,$4,$4,$6,'Full service completed; brake pads replaced.',18500)`,
      [car1, manager, manager, days(-40), 'Toyota Authorized Service', days(-37)]
    );

    console.log('Seeding audit cycle…');
    const auditRes = await c.query(
      `INSERT INTO audits (name, description, department_id, status, assigned_to, created_by, due_date, started_at)
       VALUES ('H1 2026 Engineering Audit','Physical verification of all engineering department assets',$1,'IN_PROGRESS',$2,$3,$4,$5) RETURNING id`,
      [dEng, manager, admin, days(14), days(-5)]
    );
    const auditId = auditRes.rows[0].id;
    const engAssets = await c.query(
      `SELECT a.id FROM assets a JOIN departments d ON d.id = a.department_id
       WHERE d.id = $1 OR d.parent_id = $1`,
      [dEng]
    );
    for (const [i, row] of engAssets.rows.entries()) {
      const verification = i === 0 ? 'VERIFIED' : i === 1 ? 'DAMAGED' : i === 2 ? 'MISSING' : 'PENDING';
      await c.query(
        `INSERT INTO audit_items (audit_id, asset_id, verification, remarks, verified_by, verified_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [auditId, row.id, verification,
         verification === 'DAMAGED' ? 'Cracked hinge; still functional' : verification === 'MISSING' ? 'Not found at recorded location' : null,
         verification === 'PENDING' ? null : manager,
         verification === 'PENDING' ? null : days(-1)]
      );
    }

    console.log('Seeding notifications…');
    const notify = (userId, type, title, message, link) =>
      c.query(
        `INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,$2,$3,$4,$5)`,
        [userId, type, title, message, link]
      );
    await notify(e1, 'ASSIGNMENT', 'Asset allocated to you', 'MacBook Pro 14" M3 (AST-1001) has been allocated to you.', '/my-assets');
    await notify(e2, 'TRANSFER', 'Transfer request involves you', 'A transfer of MacBook Pro 14" M3 to you has been requested.', '/transfers');
    await notify(manager, 'MAINTENANCE', 'New maintenance request', 'Battery issue reported on MacBook Air 2019 (AST-1007).', '/maintenance');
    await notify(manager, 'OVERDUE', 'Overdue return', 'ThinkPad T14s allocated to Meera Joshi is 6 days overdue.', '/allocations');
    await notify(e6, 'OVERDUE', 'Return overdue', 'Your ThinkPad T14s return was due 6 days ago. Please return it.', '/my-assets');
    await notify(headEng, 'BOOKING', 'Booking confirmed', 'Conference Room — Everest booked for tomorrow 10:00–12:00.', '/bookings');
    await notify(admin, 'AUDIT', 'Audit discrepancy found', 'H1 2026 Engineering Audit: 1 missing, 1 damaged asset reported.', '/audits');

    console.log('Seeding activity logs…');
    const log = (actorId, role, action, entityType, details) =>
      c.query(
        `INSERT INTO activity_logs (actor_id, actor_role, action, entity_type, details) VALUES ($1,$2,$3,$4,$5)`,
        [actorId, role, action, entityType, details]
      );
    await log(admin, 'ADMIN', 'ORG_UPDATED', 'organization', 'Organization profile configured');
    await log(admin, 'ADMIN', 'USER_CREATED', 'user', 'Seeded demo users');
    await log(manager, 'ASSET_MANAGER', 'ASSET_ALLOCATED', 'asset', 'MacBook Pro 14" M3 allocated to Ishaan Gupta');
    await log(manager, 'ASSET_MANAGER', 'MAINTENANCE_APPROVED', 'maintenance', 'Projector lamp repair approved and technician assigned');
    await log(admin, 'ADMIN', 'AUDIT_CREATED', 'audit', 'H1 2026 Engineering Audit started');

    // Keep auto-generated asset tags ahead of seeded ones.
    await c.query(`SELECT setval('asset_tag_seq', $1)`, [tagSeq]);
  });

  console.log('✔ Seed complete');
  console.log('   Admin:          admin@assetflow.io / Admin@123');
  console.log('   Asset Manager:  manager@assetflow.io / Password@123');
  console.log('   Dept Head:      rohan.mehta@assetflow.io / Password@123');
  console.log('   Employee:       ishaan.gupta@assetflow.io / Password@123');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
