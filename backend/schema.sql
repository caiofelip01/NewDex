CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  revenue_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  avatar_label TEXT NOT NULL DEFAULT '',
  color_hex TEXT NOT NULL DEFAULT '#FF6B2B',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  hire_date DATE,
  specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
  work_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  visit_count INTEGER NOT NULL DEFAULT 0,
  total_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  avatar_label TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  birth_date DATE,
  last_visit_at DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  minimum_quantity INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  brand TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL,
  quantity_change INTEGER NOT NULL,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  unit_cost NUMERIC(12,2),
  total_amount NUMERIC(12,2),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_entries (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  inventory_movement_id UUID REFERENCES inventory_movements(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_snapshots (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  month_label TEXT NOT NULL,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, month_key)
);

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  revenue_target NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, month_key)
);

CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS board_columns (
  id UUID PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS board_cards (
  id UUID PRIMARY KEY,
  column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL,
  responsible_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  due_date DATE,
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS card_checklists (
  id UUID PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  text_value TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_comments (
  id UUID PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routine_checklist_items (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  text_value TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  icon TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_shop_id ON appointments(shop_id);
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_employees_shop_id ON employees(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_shop_id ON financial_entries(shop_id);
CREATE INDEX IF NOT EXISTS idx_notifications_shop_id ON notifications(shop_id);

-- Evolucao idempotente para bancos criados antes das integracoes de dominio.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS movement_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2);
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE;
ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS inventory_movement_id UUID REFERENCES inventory_movements(id) ON DELETE CASCADE;
ALTER TABLE board_cards
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_entries_appointment_id
  ON financial_entries(appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_entries_inventory_movement_id
  ON financial_entries(inventory_movement_id)
  WHERE inventory_movement_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_cards_auto_product_id
  ON board_cards(product_id)
  WHERE auto_generated = TRUE AND product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_shop_date_status
  ON appointments(shop_id, scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id
  ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_employee_id
  ON appointments(employee_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_shop_date_type
  ON financial_entries(shop_id, entry_date, entry_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_shop_product_date
  ON inventory_movements(shop_id, product_id, movement_date);
