<p align="center">
  <img src="https://img.shields.io/badge/AssetFlow-Enterprise_ERP-4f46e5?style=for-the-badge&labelColor=0f172a" alt="AssetFlow" />
</p>

<h1 align="center">AssetFlow</h1>
<p align="center">
  <b>Enterprise Asset &amp; Resource Management System</b><br/>
  <sub>Register · Allocate · Transfer · Book · Maintain · Audit — all in one place.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/Neon-Serverless_DB-00e599?logo=neon&logoColor=white&style=flat-square" />
</p>

---

## ✨ Overview

**AssetFlow** is a full-stack enterprise asset management system built for the Odoo Hackathon. It provides end-to-end lifecycle management for organizational assets — from registration through allocation, transfer, maintenance, and retirement — with role-based access control, real-time notifications, conflict-free resource booking, and comprehensive analytics.

> **Built with:** React 19 + Vite 8 (frontend) · Express 5 + PostgreSQL on Neon (backend) · JWT auth · Tailwind CSS 4 · Framer Motion · Recharts

---

## 🏗️ Architecture

```
odoo-hack/
├── client/                 # React SPA (Vite)
│   ├── src/
│   │   ├── api/            # Axios client with JWT interceptor
│   │   ├── components/ui/  # Reusable UI primitives (Button, Badge, Modal, DataTable…)
│   │   ├── context/        # AuthContext, ToastContext
│   │   ├── hooks/          # useFetch, usePagedList
│   │   ├── layout/         # AppLayout, Sidebar, Topbar (global search + notifications)
│   │   ├── pages/          # 20+ page components
│   │   └── utils/          # Constants, formatters
│   └── vite.config.js      # Vite + React + Tailwind + API proxy
│
└── server/                 # Express 5 REST API
    └── src/
        ├── config/         # Database pool (pg)
        ├── constants/      # Role definitions
        ├── db/             # schema.sql (380 LOC, 3NF) + seed.js + migrate.js
        ├── middleware/      # JWT auth, role authorization, validation (Zod)
        ├── routes/         # 16 route modules
        ├── services/       # Activity logger, notifications, scheduler, lifecycle
        └── utils/          # Async handler, helpers
```

---

## 🚀 Features

### Core Asset Lifecycle
| Feature | Description |
|---|---|
| **Asset Registry** | Register assets with tags (auto-generated), categories, serial numbers, costs, warranty tracking |
| **Smart Allocations** | Assign assets to employees with due dates, purpose tracking, and return workflows |
| **Transfers** | Request, approve/reject, and complete asset transfers between employees and departments |
| **Maintenance** | Log corrective/preventive/inspection requests with priority, technician assignment, and cost tracking |
| **Resource Booking** | Calendar-based booking for shared resources (rooms, vehicles, equipment) with overlap prevention |
| **Audits** | Plan and execute asset audits — verify, flag missing/damaged, and close with full reporting |

### Platform Capabilities
| Feature | Description |
|---|---|
| **Role-Based Access** | 4 roles: `Admin`, `Asset Manager`, `Department Head`, `Employee` — each with scoped views and permissions |
| **Real-Time Notifications** | In-app notification bell with unread counts, polling, and mark-all-read |
| **Global Search** | `⌘K` powered search across assets, people, and maintenance requests |
| **Reports & Analytics** | 10 report types with charts (utilization, department summary, booking heatmap, idle assets, and more) — exportable as CSV |
| **Activity Logs** | Immutable, append-only audit trail of every action across the system |
| **Organization Settings** | Configure company name, currency, timezone, asset tag prefix, and more |
| **Password Recovery** | Token-based password reset flow (demo mode surfaces the token directly) |

---

## 🛡️ Database Design

The schema is in **3rd Normal Form** with serious business-rule enforcement at the DB level:

- **State-machine trigger** on `assets.status` — prevents invalid lifecycle transitions (e.g., `DISPOSED → AVAILABLE`)
- **Partial unique index** on `allocations` — guarantees at most one active allocation per asset
- **Exclusion constraint** on `bookings` — prevents overlapping reservations via `btree_gist`
- **Immutability trigger** on `activity_logs` — rejects `UPDATE`/`DELETE` at the database level
- **Check constraints** — warranty dates, cost non-negativity, self-referencing department guards

### Entity Relationship Summary

```
Organization (1)
  └── Departments (hierarchy via parent_id)
        ├── Users (employees)
        └── Assets
              ├── Allocations (1 active max per asset)
              ├── Transfers (approval workflow)
              ├── Bookings (overlap-free via exclusion)
              ├── Maintenance Requests (priority queue)
              ├── Audit Items (per-audit verification)
              └── Status History (immutable log)

Notifications → per user
Activity Logs → immutable system-wide trail
```

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** (or a [Neon](https://neon.tech) serverless database)

### 1. Clone the repository

```bash
git clone https://github.com/Erennn7/odoo-virtual-round.git
cd odoo-virtual-round
```

### 2. Set up the server

```bash
cd server
npm install
```

Create a `.env` file:

```env
PORT=5001
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRES_IN=8h
CLIENT_ORIGIN=http://localhost:5173
```

Run the database migration and seed:

```bash
npm run migrate    # Creates all tables, triggers, constraints
npm run seed       # Populates demo data (users, assets, bookings…)
```

Start the server:

```bash
npm run dev
```

### 3. Set up the client

```bash
cd ../client
npm install
npm run dev
```

The app will be available at **[http://localhost:5173](http://localhost:5173)**

---

## 🔑 Demo Accounts

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@assetflow.io` | `Admin@123` |
| **Asset Manager** | `manager@assetflow.io` | `Password@123` |
| **Department Head** | `rohan.mehta@assetflow.io` | `Password@123` |
| **Employee** | `ishaan.gupta@assetflow.io` | `Password@123` |

---

## 📡 API Reference

All endpoints are prefixed with `/api`. Authentication is via `Bearer` token in the `Authorization` header.

| Module | Endpoints | Auth |
|---|---|---|
| **Auth** | `POST /auth/login`, `POST /auth/signup`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/reset-password` | Public (login/signup) |
| **Assets** | CRUD + status transitions, lifecycle history | All roles |
| **Allocations** | Create, return, list with filters | Leadership |
| **Transfers** | Request, approve, reject, complete | All roles |
| **Bookings** | Create, cancel, list by asset/user | All roles |
| **Maintenance** | Request, approve, assign, resolve | All roles |
| **Audits** | Create, start, verify items, close | Leadership |
| **Reports** | 10 report endpoints + CSV export | Leadership |
| **Dashboard** | Role-aware KPIs and summaries | All roles |
| **Search** | Global search across assets, users, maintenance | All roles |
| **Notifications** | List, mark read, mark all read | All roles |
| **Activity Logs** | Paginated immutable log | Leadership |
| **Users** | List, update roles, toggle active | Leadership |
| **Departments** | CRUD with hierarchy | Admin |
| **Categories** | CRUD with lifespan config | Admin / Manager |
| **Organization** | Single-row settings | Admin |

---

## 🧰 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 19** | UI framework with lazy-loaded routes |
| **Vite 8** | Lightning-fast dev server and build |
| **Tailwind CSS 4** | Utility-first styling via `@tailwindcss/vite` |
| **Framer Motion** | Page transitions, modals, micro-animations |
| **Recharts** | Bar charts, heatmaps for analytics |
| **Lucide React** | 1,500+ consistent icons |
| **React Router 7** | Client-side routing with protected/public layouts |
| **Axios** | HTTP client with JWT interceptor and error normalization |
| **date-fns** | Lightweight date formatting and relative time |

### Backend
| Technology | Purpose |
|---|---|
| **Express 5** | HTTP framework with async route handlers |
| **PostgreSQL** | Relational database with advanced constraints |
| **Neon** | Serverless Postgres (connection pooling) |
| **pg** | Node.js PostgreSQL driver |
| **Zod 4** | Runtime request validation |
| **bcryptjs** | Secure password hashing |
| **jsonwebtoken** | JWT token signing and verification |
| **dotenv** | Environment configuration |

---

## 📁 Scripts

### Server

```bash
npm run dev       # Start with --watch (auto-restart)
npm start         # Production start
npm run migrate   # Run schema.sql against the database
npm run seed      # Populate demo data
```

### Client

```bash
npm run dev       # Vite dev server (HMR)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # Oxlint
```

---

## 📐 Design Decisions

- **No ORM** — Raw SQL with parameterized queries for full control over Postgres-specific features (exclusion constraints, partial indexes, triggers)
- **DB-enforced business rules** — Critical invariants (single active allocation, no overlapping bookings, valid status transitions) are enforced at the database level, not just in application code
- **Immutable audit trail** — Activity logs cannot be modified or deleted, even by direct SQL
- **Lazy-loaded routes** — Every page is code-split via `React.lazy` for fast initial load
- **Single UI component library** — All visual primitives live in `components/ui/index.jsx` — no page re-implements buttons, badges, or tables
- **Role-filtered navigation** — The sidebar, dashboard KPIs, and API responses adapt to the authenticated user's role

---

## 👥 Team

Built with ❤️ for the **Odoo Hackathon — Virtual Round**

---

<p align="center">
  <sub>© 2026 AssetFlow · PostgreSQL on Neon</sub>
</p>
