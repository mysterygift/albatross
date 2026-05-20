//! Canonical SQLite paths — must match `tauri-plugin-sql` (`app_config_dir` + filename).

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

pub const DB_FILE_NAME: &str = "albatross.db";
pub const DB_META_FILENAME: &str = "albatross.db.meta.json";

pub fn app_sqlite_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| e.to_string())
}

pub fn sqlite_db_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_sqlite_dir(app)?.join(DB_FILE_NAME))
}

pub fn sqlite_meta_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_sqlite_dir(app)?.join(DB_META_FILENAME))
}
