use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let migrations = vec![
    Migration {
      version: 1,
      description: "initial_schema",
      sql: include_str!("../migrations/0001_initial.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "stripboard_dood_callsheet",
      sql: include_str!("../migrations/0002_stripboard_dood_callsheet.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "productions_slug_seed_meta",
      sql: include_str!("../migrations/0003_productions_slug_seed_meta.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "fk_cascade_refactor",
      sql: include_str!("../migrations/0004_fk_cascade_refactor.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "scenes_duration_minutes",
      sql: include_str!("../migrations/0005_scenes_duration_minutes.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 6,
      description: "shots_rich_props_equipment_terms",
      sql: include_str!("../migrations/0006_shots_rich_props_equipment_terms.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 7,
      description: "shots_estimated_shoot_minutes",
      sql: include_str!("../migrations/0007_shots_estimated_shoot_minutes.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 8,
      description: "stripboard_strips_estimated_minutes",
      sql: include_str!("../migrations/0008_stripboard_strips_estimated_minutes.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 9,
      description: "currency_settings_exchange_rates",
      sql: include_str!("../migrations/0009_currency_settings_exchange_rates.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 10,
      description: "stripboard_strip_status_boneyard",
      sql: include_str!("../migrations/0010_stripboard_strip_status_boneyard.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 11,
      description: "stripboard_shots_and_shot_description",
      sql: include_str!("../migrations/0011_stripboard_shots_and_shot_description.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 12,
      description: "productions_archived_at",
      sql: include_str!("../migrations/0012_productions_archived_at.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 13,
      description: "budget_accounts_chart_of_accounts",
      sql: include_str!("../migrations/0013_budget_accounts_chart_of_accounts.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 14,
      description: "budget_items_category_nullable",
      sql: include_str!("../migrations/0014_budget_items_category_nullable.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 15,
      description: "fringe_contingency_rules",
      sql: include_str!("../migrations/0015_fringe_contingency_rules.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 16,
      description: "cost_report_groups",
      sql: include_str!("../migrations/0016_cost_report_groups.sql"),
      kind: MigrationKind::Up,
    },
  ];

  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:albatross.db", migrations)
        .build(),
    )
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
