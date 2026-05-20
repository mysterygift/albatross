//! Local SQLite file encryption (SQLCipher): migration, probes, and status.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use crate::sqlite_paths::{self, sqlite_db_path};

const PLAIN_SQLITE_HEADER: &[u8] = b"SQLite format 3";

pub fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    sqlite_db_path(app)
}

pub fn is_plain_sqlite_file(path: &Path) -> Result<bool, String> {
    if !path.is_file() {
        return Ok(false);
    }
    let mut header = [0u8; 16];
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    use std::io::Read;
    let n = file.read(&mut header).map_err(|e| e.to_string())?;
    Ok(n >= PLAIN_SQLITE_HEADER.len() && header.starts_with(PLAIN_SQLITE_HEADER))
}

fn apply_cipher_key(conn: &Connection, passphrase: &str) -> Result<(), String> {
    conn.execute_batch(&format!(
        "PRAGMA key = '{}';",
        passphrase.replace('\'', "''")
    ))
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn verify_connection(conn: &Connection) -> Result<(), String> {
    conn.query_row("SELECT 1", [], |_| Ok(()))
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbStatus {
    pub db_file_exists: bool,
    pub encryption_meta_exists: bool,
    pub is_plain_sqlite: bool,
}

#[tauri::command]
pub fn get_local_db_status(app: tauri::AppHandle, meta_path: String) -> Result<LocalDbStatus, String> {
    let db_path = db_path(&app)?;
    let meta = PathBuf::from(meta_path);
    let db_file_exists = db_path.is_file();
    let encryption_meta_exists = meta.is_file();
    let is_plain_sqlite = if db_file_exists {
        is_plain_sqlite_file(&db_path)?
    } else {
        false
    };
    Ok(LocalDbStatus {
        db_file_exists,
        encryption_meta_exists,
        is_plain_sqlite,
    })
}

fn pre_sqlcipher_backup_path(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .map(|p| p.join(format!("{}.pre-sqlcipher-backup", sqlite_paths::DB_FILE_NAME)))
        .unwrap_or_else(|| PathBuf::from(format!("{}.pre-sqlcipher-backup", sqlite_paths::DB_FILE_NAME)))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreSqlcipherBackupStatus {
    pub backup_exists: bool,
    pub backup_is_plain_sqlite: bool,
}

#[tauri::command]
pub fn get_pre_sqlcipher_backup_status(app: tauri::AppHandle) -> Result<PreSqlcipherBackupStatus, String> {
    let db_path = db_path(&app)?;
    let backup_path = pre_sqlcipher_backup_path(&db_path);
    let backup_exists = backup_path.is_file();
    let backup_is_plain_sqlite = backup_exists && is_plain_sqlite_file(&backup_path)?;
    Ok(PreSqlcipherBackupStatus {
        backup_exists,
        backup_is_plain_sqlite,
    })
}

/// Replace `albatross.db` with the plain `*.pre-sqlcipher-backup` from a prior migration.
#[tauri::command]
pub fn restore_sqlite_from_pre_sqlcipher_backup(app: tauri::AppHandle) -> Result<(), String> {
    let db_path = db_path(&app)?;
    let backup_path = pre_sqlcipher_backup_path(&db_path);
    if !backup_path.is_file() {
        return Err("No pre-sqlcipher backup file found".into());
    }
    if !is_plain_sqlite_file(&backup_path)? {
        return Err("Backup is not a readable plain SQLite database".into());
    }
    fs::copy(&backup_path, &db_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn probe_sqlcipher_passphrase(app: tauri::AppHandle, passphrase: String) -> Result<bool, String> {
    let path = db_path(&app)?;
    if !path.is_file() {
        return Ok(false);
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    apply_cipher_key(&conn, &passphrase)?;
    Ok(verify_connection(&conn).is_ok())
}

/// Export plain `albatross.db` to a new SQLCipher file and atomically replace.
#[tauri::command]
pub fn migrate_plain_db_to_sqlcipher(
    app: tauri::AppHandle,
    passphrase: String,
) -> Result<(), String> {
    let db_path = db_path(&app)?;
    if !db_path.is_file() {
        return Err("Database file not found".into());
    }
    if !is_plain_sqlite_file(&db_path)? {
        return Err("Database is not a plain SQLite file (already encrypted or invalid)".into());
    }

    let parent = db_path
        .parent()
        .ok_or_else(|| "Invalid database path".to_string())?;
    let backup_path = parent.join(format!("{}.pre-sqlcipher-backup", sqlite_paths::DB_FILE_NAME));
    let new_path = parent.join(format!("{}.new", sqlite_paths::DB_FILE_NAME));

    if new_path.exists() {
        fs::remove_file(&new_path).map_err(|e| e.to_string())?;
    }

    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let new_path_sql = new_path.to_string_lossy().replace('\'', "''");
    let pass_escaped = passphrase.replace('\'', "''");
    conn.execute_batch(&format!(
        "ATTACH DATABASE '{new_path_sql}' AS encrypted KEY '{pass_escaped}';
         SELECT sqlcipher_export('encrypted');
         DETACH DATABASE encrypted;"
    ))
    .map_err(|e| {
        let _ = fs::copy(&backup_path, &db_path);
        format!("sqlcipher_export failed: {e}")
    })?;

    drop(conn);

    fs::rename(&new_path, &db_path).map_err(|e| e.to_string())?;

    let verify = Connection::open(&db_path).map_err(|e| e.to_string())?;
    apply_cipher_key(&verify, &passphrase)?;
    verify_connection(&verify)?;

    Ok(())
}

#[tauri::command]
pub fn sqlcipher_self_test() -> Result<(), String> {
    let dir = std::env::temp_dir().join(format!("albatross-sqlcipher-test-{}", std::process::id()));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("test.db");
    let _ = fs::remove_file(&path);

    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    apply_cipher_key(&conn, "test-passphrase-hex")?;
    conn.execute_batch(
        "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);
         INSERT INTO t (v) VALUES ('ok');",
    )
    .map_err(|e| e.to_string())?;
    drop(conn);

    let wrong = Connection::open(&path).map_err(|e| e.to_string())?;
    apply_cipher_key(&wrong, "wrong-key")?;
    let wrong_read: Result<String, _> =
        wrong.query_row("SELECT v FROM t LIMIT 1", [], |r| r.get(0));
    if wrong_read.ok().as_deref() == Some("ok") {
        let _ = fs::remove_dir_all(&dir);
        return Err("SQLCipher accepted wrong key".into());
    }
    drop(wrong);

    let conn2 = Connection::open(&path).map_err(|e| e.to_string())?;
    apply_cipher_key(&conn2, "test-passphrase-hex")?;
    let v: String = conn2
        .query_row("SELECT v FROM t LIMIT 1", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&dir);
    if v != "ok" {
        return Err(format!("Unexpected value: {v}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::sqlcipher_self_test;

    #[test]
    fn sqlcipher_self_test_runs() {
        sqlcipher_self_test().expect("SQLCipher self-test");
    }
}
