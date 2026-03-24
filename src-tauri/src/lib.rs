mod apf_desktop;
mod open_route_service;

use tauri::Manager;
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
        Migration {
            version: 17,
            description: "budget_accounts_archived_at",
            sql: include_str!("../migrations/0017_budget_accounts_archived_at.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "budget_accounts_color_hex",
            sql: include_str!("../migrations/0018_budget_accounts_color_hex.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "production_totals",
            sql: include_str!("../migrations/0019_production_totals.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "vendors_and_expense_transaction_details",
            sql: include_str!("../migrations/0020_vendors_and_expense_transaction_details.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "budget_item_typed_details",
            sql: include_str!("../migrations/0021_budget_item_typed_details.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "budget_item_expense_links",
            sql: include_str!("../migrations/0022_budget_item_expense_links.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "productions_wrapped_at",
            sql: include_str!("../migrations/0023_productions_wrapped_at.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "production_tasks",
            sql: include_str!("../migrations/0024_production_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "production_tasks_parent_task_id",
            sql: include_str!("../migrations/0025_production_tasks_parent_task_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "production_task_sections",
            sql: include_str!("../migrations/0026_production_task_sections.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "production_tasks_section_id",
            sql: include_str!("../migrations/0027_production_tasks_section_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "task_templates",
            sql: include_str!("../migrations/0028_task_templates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "deliverables_expanded",
            sql: include_str!("../migrations/0029_deliverables_expanded.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 30,
            description: "deliverable_templates",
            sql: include_str!("../migrations/0030_deliverable_templates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 31,
            description: "deliverable_template_defaults",
            sql: include_str!("../migrations/0031_deliverable_template_defaults.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 32,
            description: "productions_created_from_template",
            sql: include_str!("../migrations/0032_productions_created_from_template.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 33,
            description: "locations_w3w",
            sql: include_str!("../migrations/0033_locations_w3w.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 34,
            description: "vendor_invoices",
            sql: include_str!("../migrations/0034_vendor_invoices.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 35,
            description: "production_tasks_vendor_invoice_id",
            sql: include_str!("../migrations/0035_production_tasks_vendor_invoice_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 36,
            description: "vendor_purchase_orders",
            sql: include_str!("../migrations/0036_vendor_purchase_orders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 37,
            description: "vendor_invoices_po_id",
            sql: include_str!("../migrations/0037_vendor_invoices_po_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 38,
            description: "vendor_invoice_expenses",
            sql: include_str!("../migrations/0038_vendor_invoice_expenses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 39,
            description: "vendor_purchase_order_expenses",
            sql: include_str!("../migrations/0039_vendor_purchase_order_expenses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 40,
            description: "people_cast_agent",
            sql: include_str!("../migrations/0040_people_cast_agent.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 41,
            description: "shot_cast",
            sql: include_str!("../migrations/0041_shot_cast.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 42,
            description: "people_role_name",
            sql: include_str!("../migrations/0042_people_role_name.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 43,
            description: "production_crew_hierarchy_configs",
            sql: include_str!("../migrations/0043_production_crew_hierarchy_configs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 44,
            description: "equipment_registry",
            sql: include_str!("../migrations/0044_equipment_registry.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 45,
            description: "production_tasks_equipment_id",
            sql: include_str!("../migrations/0045_production_tasks_equipment_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 46,
            description: "equipment_lists",
            sql: include_str!("../migrations/0046_equipment_lists.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 47,
            description: "equipment_quantity",
            sql: include_str!("../migrations/0047_equipment_quantity.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 48,
            description: "equipment_category_normalisation",
            sql: include_str!("../migrations/0048_equipment_category_normalisation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 49,
            description: "equipment_department_crew_alignment",
            sql: include_str!("../migrations/0049_equipment_department_crew_alignment.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 50,
            description: "locations_parking_info",
            sql: include_str!("../migrations/0050_locations_parking_info.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 51,
            description: "api_cache",
            sql: include_str!("../migrations/0051_api_cache.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 52,
            description: "floats",
            sql: include_str!("../migrations/0052_floats.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 53,
            description: "float_expense_links",
            sql: include_str!("../migrations/0053_float_expense_links.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            apf_desktop::on_second_instance(&app, &argv);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:albatross.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            apf_desktop::pop_pending_apf_open_paths,
            apf_desktop::grant_read_access_for_apf,
            open_route_service::get_driving_travel_time_minutes,
            open_route_service::get_route_summary,
            open_route_service::geocode_location_to_lat_lng,
        ])
        .setup(|app| {
            let cold = apf_desktop::collect_apf_paths_from_os_args(std::env::args_os().skip(1));
            app.manage(apf_desktop::ApfOpenQueue(std::sync::Mutex::new(cold)));

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
