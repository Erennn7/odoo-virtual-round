-- ============================================================
-- AssetFlow — Enterprise Asset & Resource Management System
-- PostgreSQL schema (3NF). Business rules are enforced here as
-- well as in the application layer: unique constraints, check
-- constraints, a state-machine trigger for asset lifecycle,
-- a partial unique index preventing double allocation, and an
-- exclusion constraint preventing overlapping bookings.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- Enum types ----------
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('ADMIN','ASSET_MANAGER','DEPARTMENT_HEAD','EMPLOYEE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE asset_status AS ENUM ('AVAILABLE','ALLOCATED','RESERVED','UNDER_MAINTENANCE','LOST','RETIRED','DISPOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE asset_condition AS ENUM ('NEW','GOOD','FAIR','POOR','DAMAGED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE allocation_status AS ENUM ('ACTIVE','RETURNED','TRANSFERRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transfer_status AS ENUM ('REQUESTED','APPROVED','REJECTED','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE booking_status AS ENUM ('UPCOMING','ONGOING','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE maintenance_status AS ENUM ('PENDING','APPROVED','REJECTED','ASSIGNED','IN_PROGRESS','RESOLVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE maintenance_priority AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE maintenance_type AS ENUM ('PREVENTIVE','CORRECTIVE','INSPECTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE audit_status AS ENUM ('PLANNED','IN_PROGRESS','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE verification_status AS ENUM ('PENDING','VERIFIED','MISSING','DAMAGED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('ASSIGNMENT','RETURN','TRANSFER','MAINTENANCE','BOOKING','AUDIT','OVERDUE','SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Organization (single-row setup) ----------
CREATE TABLE IF NOT EXISTS organization (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name          VARCHAR(150) NOT NULL,
  legal_name    VARCHAR(200),
  email         VARCHAR(150),
  phone         VARCHAR(30),
  address       TEXT,
  city          VARCHAR(100),
  country       VARCHAR(100),
  timezone      VARCHAR(60) NOT NULL DEFAULT 'UTC',
  currency      VARCHAR(10) NOT NULL DEFAULT 'USD',
  logo_url      TEXT,
  asset_tag_prefix VARCHAR(10) NOT NULL DEFAULT 'AST',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Departments (self-referencing hierarchy) ----------
CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  code        VARCHAR(20)  NOT NULL,
  description TEXT,
  parent_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  head_id     UUID,  -- FK added after users table exists
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_departments_name UNIQUE (name),
  CONSTRAINT uq_departments_code UNIQUE (code),
  CONSTRAINT chk_department_not_own_parent CHECK (parent_id IS DISTINCT FROM id)
);

-- ---------- Users ----------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(20) NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'EMPLOYEE',
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  designation   VARCHAR(100),
  phone         VARCHAR(30),
  avatar_color  VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_employee_code UNIQUE (employee_code),
  CONSTRAINT chk_users_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Case-insensitive uniqueness for emails.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(LOWER(email));

DO $$ BEGIN
  ALTER TABLE departments
    ADD CONSTRAINT fk_departments_head FOREIGN KEY (head_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ---------- Password resets ----------
CREATE TABLE IF NOT EXISTS password_resets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- ---------- Asset categories ----------
CREATE TABLE IF NOT EXISTS asset_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  code          VARCHAR(20) NOT NULL,
  description   TEXT,
  expected_lifespan_months INT CHECK (expected_lifespan_months > 0),
  is_bookable_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_name UNIQUE (name),
  CONSTRAINT uq_categories_code UNIQUE (code)
);

-- ---------- Assets ----------
CREATE TABLE IF NOT EXISTS assets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag      VARCHAR(30) NOT NULL,
  name           VARCHAR(150) NOT NULL,
  category_id    UUID NOT NULL REFERENCES asset_categories(id) ON DELETE RESTRICT,
  department_id  UUID REFERENCES departments(id) ON DELETE SET NULL,
  serial_number  VARCHAR(100),
  model          VARCHAR(120),
  manufacturer   VARCHAR(120),
  purchase_date  DATE,
  purchase_cost  NUMERIC(14,2) CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
  warranty_expiry DATE,
  condition      asset_condition NOT NULL DEFAULT 'GOOD',
  status         asset_status NOT NULL DEFAULT 'AVAILABLE',
  location       VARCHAR(150),
  image_url      TEXT,
  notes          TEXT,
  is_bookable    BOOLEAN NOT NULL DEFAULT FALSE,
  retired_at     TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_assets_tag UNIQUE (asset_tag),
  CONSTRAINT uq_assets_serial UNIQUE (serial_number),
  CONSTRAINT chk_warranty_after_purchase CHECK (warranty_expiry IS NULL OR purchase_date IS NULL OR warranty_expiry >= purchase_date)
);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_department ON assets(department_id);
CREATE INDEX IF NOT EXISTS idx_assets_name_trgm ON assets(LOWER(name));

-- ---------- Asset status history (never overwrite, always append) ----------
CREATE TABLE IF NOT EXISTS asset_status_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  from_status asset_status,
  to_status   asset_status NOT NULL,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_status_history_asset ON asset_status_history(asset_id);

-- ---------- Asset lifecycle state machine (DB-level enforcement) ----------
CREATE OR REPLACE FUNCTION enforce_asset_status_transition() RETURNS TRIGGER AS $$
DECLARE
  allowed BOOLEAN := FALSE;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  allowed := CASE OLD.status
    WHEN 'AVAILABLE'         THEN NEW.status IN ('ALLOCATED','RESERVED','UNDER_MAINTENANCE','LOST','RETIRED')
    WHEN 'ALLOCATED'         THEN NEW.status IN ('AVAILABLE','UNDER_MAINTENANCE','LOST')
    WHEN 'RESERVED'          THEN NEW.status IN ('AVAILABLE','ALLOCATED')
    WHEN 'UNDER_MAINTENANCE' THEN NEW.status IN ('AVAILABLE','ALLOCATED','RETIRED','DISPOSED')
    WHEN 'LOST'              THEN NEW.status IN ('AVAILABLE','DISPOSED')
    WHEN 'RETIRED'           THEN NEW.status IN ('DISPOSED')
    WHEN 'DISPOSED'          THEN FALSE
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid asset status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asset_status_transition ON assets;
CREATE TRIGGER trg_asset_status_transition
  BEFORE UPDATE OF status ON assets
  FOR EACH ROW EXECUTE FUNCTION enforce_asset_status_transition();

-- ---------- Allocations ----------
CREATE TABLE IF NOT EXISTS allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  allocated_to     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allocated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  status           allocation_status NOT NULL DEFAULT 'ACTIVE',
  purpose          TEXT,
  allocated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date         DATE,
  returned_at      TIMESTAMPTZ,
  return_condition asset_condition,
  return_notes     TEXT,
  received_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  overdue_notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_returned_fields CHECK (
    (status = 'ACTIVE' AND returned_at IS NULL)
    OR (status <> 'ACTIVE')
  )
);
-- HARD business rule: an asset can have at most ONE active allocation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_allocations_one_active
  ON allocations(asset_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_allocations_user ON allocations(allocated_to);
CREATE INDEX IF NOT EXISTS idx_allocations_asset ON allocations(asset_id);
CREATE INDEX IF NOT EXISTS idx_allocations_due ON allocations(due_date) WHERE status = 'ACTIVE';

-- ---------- Transfers ----------
CREATE TABLE IF NOT EXISTS transfers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  from_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  to_department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  requested_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  status         transfer_status NOT NULL DEFAULT 'REQUESTED',
  reason         TEXT,
  decided_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at     TIMESTAMPTZ,
  decision_notes TEXT,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_transfer_users_differ CHECK (from_user_id IS DISTINCT FROM to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_asset ON transfers(asset_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
-- Only one open transfer request per asset at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfers_one_open
  ON transfers(asset_id) WHERE status IN ('REQUESTED','APPROVED');

-- ---------- Bookings (shared resources) ----------
CREATE TABLE IF NOT EXISTS bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  booked_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  status      booking_status NOT NULL DEFAULT 'UPCOMING',
  attendees   INT CHECK (attendees IS NULL OR attendees > 0),
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_booking_times CHECK (end_time > start_time),
  -- HARD business rule: no overlapping bookings for the same resource.
  -- '[)' half-open ranges allow back-to-back (adjacent) bookings.
  CONSTRAINT excl_booking_overlap EXCLUDE USING gist (
    asset_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status <> 'CANCELLED')
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(booked_by);
CREATE INDEX IF NOT EXISTS idx_bookings_asset_time ON bookings(asset_id, start_time);

-- ---------- Maintenance ----------
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  requested_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  title          VARCHAR(200) NOT NULL,
  description    TEXT,
  type           maintenance_type NOT NULL DEFAULT 'CORRECTIVE',
  priority       maintenance_priority NOT NULL DEFAULT 'MEDIUM',
  status         maintenance_status NOT NULL DEFAULT 'PENDING',
  decided_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at     TIMESTAMPTZ,
  decision_notes TEXT,
  technician_name VARCHAR(150),
  assigned_at    TIMESTAMPTZ,
  started_at     TIMESTAMPTZ,
  scheduled_date DATE,
  resolved_at    TIMESTAMPTZ,
  resolution_notes TEXT,
  cost           NUMERIC(12,2) CHECK (cost IS NULL OR cost >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_asset ON maintenance_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);

-- ---------- Audits ----------
CREATE TABLE IF NOT EXISTS audits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(150) NOT NULL,
  description   TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  category_id   UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  status        audit_status NOT NULL DEFAULT 'PLANNED',
  assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date      DATE,
  started_at    TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id     UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  asset_id     UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  verification verification_status NOT NULL DEFAULT 'PENDING',
  remarks      TEXT,
  verified_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at  TIMESTAMPTZ,
  CONSTRAINT uq_audit_items UNIQUE (audit_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_items_audit ON audit_items(audit_id);

-- ---------- Activity logs (immutable) ----------
CREATE TABLE IF NOT EXISTS activity_logs (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role     user_role,
  action         VARCHAR(80) NOT NULL,
  entity_type    VARCHAR(50) NOT NULL,
  entity_id      TEXT,
  previous_state JSONB,
  new_state      JSONB,
  details        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

-- Immutability: reject UPDATE/DELETE on activity logs at the DB level.
CREATE OR REPLACE FUNCTION reject_activity_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Activity logs are immutable' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_logs_immutable ON activity_logs;
CREATE TRIGGER trg_activity_logs_immutable
  BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION reject_activity_log_mutation();

-- ---------- Notifications ----------
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       notification_type NOT NULL DEFAULT 'SYSTEM',
  title      VARCHAR(200) NOT NULL,
  message    TEXT NOT NULL,
  link       VARCHAR(200),
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ---------- Asset tag sequence ----------
CREATE SEQUENCE IF NOT EXISTS asset_tag_seq START 1000;

-- ---------- updated_at maintenance ----------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['organization','departments','users','asset_categories','assets','bookings','maintenance_requests']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;
