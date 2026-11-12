const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS workspace_drafts (
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_json TEXT NOT NULL,
      content_checksum TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS change_sets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      title TEXT NOT NULL,
      business_reason TEXT NOT NULL DEFAULT '',
      base_release_id TEXT,
      draft_revision INTEGER NOT NULL,
      object_refs_json TEXT NOT NULL DEFAULT '[]',
      dependency_refs_json TEXT NOT NULL DEFAULT '[]',
      gate_result_json TEXT,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS release_snapshots (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      change_set_id TEXT NOT NULL,
      source_revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      checksum TEXT NOT NULL,
      published_by TEXT NOT NULL,
      published_at TEXT NOT NULL,
      UNIQUE (workspace_id, project_id, version),
      FOREIGN KEY (change_set_id) REFERENCES change_sets(id)
    );

    CREATE TABLE IF NOT EXISTS application_bindings (
      application_id TEXT NOT NULL,
      environment TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      active_release_id TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (application_id, environment),
      FOREIGN KEY (active_release_id) REFERENCES release_snapshots(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      request_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluation_datasets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluation_samples (
      id TEXT NOT NULL,
      dataset_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      sample_json TEXT NOT NULL,
      PRIMARY KEY (dataset_id, id),
      FOREIGN KEY (dataset_id) REFERENCES evaluation_datasets(id)
    );

    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      dataset_version INTEGER NOT NULL,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('incremental', 'full')),
      target_type TEXT NOT NULL CHECK (target_type IN ('workspace', 'release')),
      target_revision INTEGER,
      release_id TEXT,
      release_version INTEGER,
      status TEXT NOT NULL,
      total INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_by TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES evaluation_datasets(id)
    );

    CREATE TABLE IF NOT EXISTS evaluation_results (
      run_id TEXT NOT NULL,
      sample_id TEXT NOT NULL,
      query TEXT NOT NULL,
      passed INTEGER NOT NULL,
      failed_stage TEXT,
      failure_reasons_json TEXT NOT NULL,
      expected_json TEXT NOT NULL,
      actual_json TEXT NOT NULL,
      trace_json TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      PRIMARY KEY (run_id, sample_id),
      FOREIGN KEY (run_id) REFERENCES evaluation_runs(id)
    );

    CREATE TABLE IF NOT EXISTS feedback_tickets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      sample_id TEXT NOT NULL,
      query TEXT NOT NULL,
      finding_type TEXT NOT NULL,
      related_object_ids_json TEXT NOT NULL DEFAULT '[]',
      failed_stage TEXT,
      status TEXT NOT NULL,
      assignee TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (run_id, sample_id)
        REFERENCES evaluation_results(run_id, sample_id)
    );

    CREATE TRIGGER IF NOT EXISTS release_snapshots_no_update
    BEFORE UPDATE ON release_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'release snapshots are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS release_snapshots_no_delete
    BEFORE DELETE ON release_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'release snapshots are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS evaluation_results_no_update
    BEFORE UPDATE ON evaluation_results
    BEGIN
      SELECT RAISE(ABORT, 'evaluation results are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS evaluation_results_no_delete
    BEFORE DELETE ON evaluation_results
    BEGIN
      SELECT RAISE(ABORT, 'evaluation results are immutable');
    END;
  `);
  return database;
}

function inTransaction(database, operation) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

module.exports = {
  inTransaction,
  openDatabase
};
