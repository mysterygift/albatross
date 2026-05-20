//! Load SQLite with SQLCipher key before migrations (tauri-plugin-sql runs migrate on `load` without key).

use std::str::FromStr;

use futures_core::future::BoxFuture;
use sqlx::{
    error::BoxDynError,
    migrate::{Migration as SqlxMigration, MigrationSource, MigrationType, Migrator},
    sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions},
};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

use crate::sqlite_paths::sqlite_db_path;

pub struct AlbatrossSqlMigrations(pub Vec<Migration>);

fn copy_migrations(v: &[Migration]) -> Vec<Migration> {
    v.iter()
        .map(|m| Migration {
            version: m.version,
            description: m.description,
            sql: m.sql,
            kind: match m.kind {
                MigrationKind::Up => MigrationKind::Up,
                MigrationKind::Down => MigrationKind::Down,
            },
        })
        .collect()
}

#[derive(Debug)]
struct MigrationList(Vec<Migration>);

impl MigrationSource<'static> for MigrationList {
    fn resolve(self) -> BoxFuture<'static, std::result::Result<Vec<SqlxMigration>, BoxDynError>> {
        Box::pin(async move {
            let mut out = Vec::new();
            for migration in self.0 {
                if matches!(migration.kind, MigrationKind::Up) {
                    out.push(SqlxMigration::new(
                        migration.version,
                        migration.description.into(),
                        MigrationType::ReversibleUp,
                        migration.sql.into(),
                        false,
                    ));
                }
            }
            Ok(out)
        })
    }
}

fn path_mapper(app_path: std::path::PathBuf, connection_string: &str) -> String {
    let mut app_path = app_path;
    app_path.push(
        connection_string
            .split_once(':')
            .expect("Couldn't parse the connection string for DB!")
            .1,
    );
    format!(
        "sqlite:{}",
        app_path
            .to_str()
            .expect("Problem creating fully qualified path to Database file!")
    )
}

async fn connect_pool_with_passphrase<R: Runtime>(
    app: &AppHandle<R>,
    db: &str,
    passphrase: &str,
) -> Result<SqlitePool, String> {
    let db_file = sqlite_db_path(app)?;
    let app_path = db_file
        .parent()
        .ok_or_else(|| "Invalid database path".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(&app_path).map_err(|e| e.to_string())?;
    let conn_url = path_mapper(app_path, db);
    let escaped = passphrase.replace('\'', "''");
    let key_sql = format!("PRAGMA key = '{}'", escaped);
    let options = SqliteConnectOptions::from_str(&conn_url).map_err(|e| e.to_string())?;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query(&key_sql)
        .execute(&pool)
        .await
        .map_err(|e| format!("PRAGMA key failed: {e}"))?;
    sqlx::query("SELECT COUNT(*) AS n FROM sqlite_master")
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            format!(
                "database key verification failed (wrong password or corrupted file): {e}"
            )
        })?;
    Ok(pool)
}

#[tauri::command]
pub async fn load_sqlite_with_passphrase<R: Runtime>(
    app: AppHandle<R>,
    db_instances: State<'_, DbInstances>,
    migrations: State<'_, AlbatrossSqlMigrations>,
    db: String,
    passphrase: String,
) -> Result<String, String> {
    let pool = connect_pool_with_passphrase(&app, &db, &passphrase).await?;
    let migrator = Migrator::new(MigrationList(copy_migrations(&migrations.0)))
        .await
        .map_err(|e| e.to_string())?;
    migrator.run(&pool).await.map_err(|e| e.to_string())?;
    let mut lock = db_instances.0.write().await;
    lock.insert(db.clone(), DbPool::Sqlite(pool));
    Ok(db)
}

#[tauri::command]
pub async fn run_sqlite_migrations(
    db_instances: State<'_, DbInstances>,
    migrations: State<'_, AlbatrossSqlMigrations>,
    db: String,
) -> Result<(), String> {
    let instances = db_instances.0.read().await;
    let pool = instances
        .get(&db)
        .ok_or_else(|| format!("database {db} not loaded"))?;
    let DbPool::Sqlite(pool) = pool;
    let migrator = Migrator::new(MigrationList(copy_migrations(&migrations.0)))
        .await
        .map_err(|e| e.to_string())?;
    migrator.run(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}
