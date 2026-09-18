-- =============================================================================
-- Быстрое воссоздание схемы dataoffice_chat_bot
-- =============================================================================
-- Запуск в DBeaver / psql от пользователя с правами CREATE на БД:
--   \i server/db/recreate_schema.sql
-- или выполните весь файл целиком.
--
-- Для другой схемы: поменяйте DATABASE_SCHEMA в .env — API/Admin
-- применяют server/db/schema.sql с подстановкой имени при старте.
--
-- gen_random_uuid() — встроен в PostgreSQL ≥ 13 (расширение pgcrypto не нужно).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS dataoffice_chat_bot;

SET search_path TO dataoffice_chat_bot, public;

CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_user_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login TEXT NOT NULL UNIQUE,
  fullname TEXT,
  firstname TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'support', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visitors DROP CONSTRAINT IF EXISTS visitors_linked_user_id_fkey;
ALTER TABLE visitors
  ADD CONSTRAINT visitors_linked_user_id_fkey
  FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bot', 'support')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  ds_number TEXT,
  ds_name TEXT,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('bot', 'user', 'support')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Наличие у пользователя группы
CREATE TABLE IF NOT EXISTS user_groups (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  data_source TEXT,
  pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_path TEXT,
  image_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_paths JSONB NOT NULL DEFAULT '[]'::jsonb;
  UPDATE reports
  SET image_paths = jsonb_build_array(image_path)
  WHERE image_path IS NOT NULL
    AND image_path <> ''
    AND (image_paths IS NULL OR image_paths = '[]'::jsonb);
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Права группы на отчёт
CREATE TABLE IF NOT EXISTS group_report_access (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_visitor ON conversations(visitor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_support_open
  ON conversations(kind, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_groups_user ON user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_group_report_access_group ON group_report_access(group_id);
CREATE INDEX IF NOT EXISTS idx_group_report_access_report ON group_report_access(report_id);

DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'support', 'admin'));
EXCEPTION WHEN others THEN
  NULL;
END $$;
