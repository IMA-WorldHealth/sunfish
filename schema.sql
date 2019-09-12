
CREATE TABLE IF NOT EXISTS authentication (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  group_id TEXT NOT NULL,
  next_run_time TIMESTAMP NOT NULL,
  last_run_time TIMESTAMP NOT NULL,
  is_running BOOLEAN DEFAULT FALSE,
  paused BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules_dashboards (
  schedule_id INTEGER NOT NULL,
  dashboard_id TEXT NOT NULL,
  FOREIGN KEY (schedule_id) REFERENCES schedule(id),
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id)
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL
);
