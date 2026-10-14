CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  normalized_address TEXT NOT NULL,
  display_name TEXT NOT NULL,
  alias TEXT,
  bio TEXT,
  strategy_focus TEXT,
  team_note TEXT,
  first_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'system',
  curation_status TEXT NOT NULL DEFAULT 'active',
  last_imported_at TEXT,
  import_batch_id TEXT,
  deleted_at TEXT,
  deleted_by TEXT,
  delete_reason TEXT,
  watchlisted INTEGER NOT NULL DEFAULT 0,
  UNIQUE(chain, normalized_address)
);

CREATE INDEX IF NOT EXISTS idx_wallets_chain_normalized
  ON wallets(chain, normalized_address);

CREATE INDEX IF NOT EXISTS idx_wallets_updated_at
  ON wallets(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallets_deleted_at
  ON wallets(deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallets_source_status
  ON wallets(source_type, curation_status);

CREATE TABLE IF NOT EXISTS wallet_notes (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  content TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_notes_wallet_created
  ON wallet_notes(wallet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_user_labels (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence TEXT,
  created_at TEXT NOT NULL,
  verification_note TEXT,
  source_note TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_labels_wallet_created
  ON wallet_user_labels(wallet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_watchlist (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE TABLE IF NOT EXISTS wallet_audit_logs (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  action TEXT NOT NULL,
  content TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_audit_wallet_created
  ON wallet_audit_logs(wallet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_saved_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'team',
  query_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_import_batches (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_name TEXT,
  provider TEXT,
  model TEXT,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  actor TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_finder_ai_insights (
  wallet_id TEXT PRIMARY KEY,
  source_name TEXT,
  run_id TEXT,
  normalized_address TEXT,
  strategy_focus TEXT,
  ai_brief_short TEXT,
  ai_brief_note TEXT,
  ai_deep_note TEXT,
  source_excerpt TEXT,
  evidence_level TEXT,
  has_conflict INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  labels_json TEXT,
  primary_signals_json TEXT,
  key_metrics_json TEXT,
  weather_signals_json TEXT,
  provider_meta_json TEXT,
  raw_json TEXT,
  searchable_text TEXT NOT NULL DEFAULT '',
  import_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_finder_ai_run
  ON wallet_finder_ai_insights(run_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_finder_ai_updated
  ON wallet_finder_ai_insights(updated_at DESC);

CREATE TABLE IF NOT EXISTS wallet_finder_profiles (
  wallet_id TEXT PRIMARY KEY,
  source_name TEXT,
  run_id TEXT,
  normalized_address TEXT,
  snapshot_as_of TEXT,
  analysis_source TEXT,
  metrics_json TEXT,
  portrait_labels_json TEXT,
  cities_json TEXT,
  patterns_json TEXT,
  strategy_metrics_json TEXT,
  overview_json TEXT,
  coverage_json TEXT,
  searchable_text TEXT NOT NULL DEFAULT '',
  import_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_finder_profiles_updated
  ON wallet_finder_profiles(updated_at DESC);

CREATE TABLE IF NOT EXISTS extension_invites (
  code TEXT PRIMARY KEY,
  member_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  bound_user_id TEXT,
  bound_user_email TEXT,
  bound_at TEXT
);

CREATE TABLE IF NOT EXISTS extension_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  invite_code TEXT UNIQUE,
  member_label TEXT,
  bound_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  disabled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_extension_users_normalized_email
  ON extension_users(normalized_email);

CREATE TABLE IF NOT EXISTS extension_sessions (
  id TEXT PRIMARY KEY,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  member_label TEXT NOT NULL,
  invite_code TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  device_label TEXT,
  extension_version TEXT,
  refresh_expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_extension_sessions_refresh_exp
  ON extension_sessions(refresh_expires_at DESC);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  access_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  disabled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_users_normalized_email
  ON admin_users(normalized_email);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user
  ON admin_sessions(user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
  ON admin_sessions(expires_at DESC);

CREATE TABLE IF NOT EXISTS admin_registration_approvals (
  id TEXT PRIMARY KEY,
  request_email TEXT NOT NULL,
  normalized_request_email TEXT NOT NULL,
  approval_code_hash TEXT NOT NULL,
  approval_code_salt TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  requested_ip TEXT,
  request_user_agent TEXT,
  last_sent_at TEXT,
  send_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_registration_approvals_email
  ON admin_registration_approvals(normalized_request_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_registration_approvals_expires
  ON admin_registration_approvals(expires_at DESC);

CREATE TABLE IF NOT EXISTS dataset_versions (
  dataset TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- 缓存表：市场标注 / AI hover note / 通用响应缓存全部落 D1。
-- 不放 KV 的原因：KV 免费额度每天只有 1000 次写入，而缓存写在热路径上，
-- 人数一增长必然打满（线上曾出现 "KV put() limit exceeded for the day."）。
-- D1 是 100,000 行/天，且配合 etag 比对可以让写入次数等于「真实数据变化次数」，
-- 不再随请求量或人数线性增长。
CREATE TABLE IF NOT EXISTS market_annotation_cache (
  slug TEXT PRIMARY KEY,
  labels_version TEXT NOT NULL,
  etag TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_annotation_cache_updated
  ON market_annotation_cache(updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_hover_note_cache (
  cache_key TEXT PRIMARY KEY,
  summary_text TEXT NOT NULL,
  model TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_hover_note_cache_updated
  ON ai_hover_note_cache(updated_at DESC);

CREATE TABLE IF NOT EXISTS response_cache (
  cache_key TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  etag TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_response_cache_updated
  ON response_cache(updated_at DESC);
