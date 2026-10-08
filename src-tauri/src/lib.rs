mod apf_desktop;
#[cfg(target_os = "ios")]
mod apf_ios;
mod db_encryption;
mod mail_compose;
#[cfg(target_os = "ios")]
mod mail_compose_ios;
mod open_route_service;
mod sqlite_load;
mod sqlite_paths;

#[cfg(desktop)]
mod menu;
#[cfg(mobile)]
#[path = "menu_mobile.rs"]
mod menu;

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
        Migration {
            version: 54,
            description: "budget_revisions",
            sql: include_str!("../migrations/0054_budget_revisions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 55,
            description: "cost_report_groups_revision_uniqueness",
            sql: include_str!("../migrations/0055_cost_report_groups_revision_uniqueness.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 56,
            description: "float_expense_links_revision_uniqueness",
            sql: include_str!("../migrations/0056_float_expense_links_revision_uniqueness.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 57,
            description: "budget_revisions_approval",
            sql: include_str!("../migrations/0057_budget_revisions_approval.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 58,
            description: "deliverable_template_svod_packages",
            sql: include_str!("../migrations/0058_deliverable_template_svod_packages.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 59,
            description: "episodic_foundation",
            sql: include_str!("../migrations/0059_episodic_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 60,
            description: "scenes_episode_id",
            sql: include_str!("../migrations/0060_scenes_episode_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 61,
            description: "shoot_days_shooting_bloc",
            sql: include_str!("../migrations/0061_shoot_days_shooting_bloc.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 62,
            description: "music_tracks_episode_id",
            sql: include_str!("../migrations/0062_music_tracks_episode_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 63,
            description: "deliverables_episode_id",
            sql: include_str!("../migrations/0063_deliverables_episode_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 64,
            description: "storyboard_foundation",
            sql: include_str!("../migrations/0064_storyboard_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 65,
            description: "uam1_auth_foundation",
            sql: include_str!("../migrations/0065_uam1_auth_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 66,
            description: "project_memberships",
            sql: include_str!("../migrations/0066_project_memberships.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 67,
            description: "server_collab",
            sql: include_str!("../migrations/0067_server_collab.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 68,
            description: "clients_and_production_delivery",
            sql: include_str!("../migrations/0068_clients_and_production_delivery.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 69,
            description: "client_field_encryption",
            sql: include_str!("../migrations/0069_client_field_encryption.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 70,
            description: "people_is_cast_integer_normalize",
            sql: include_str!("../migrations/0070_people_is_cast_integer_normalize.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 71,
            description: "stripboard_strips_move_locations",
            sql: include_str!("../migrations/0071_stripboard_strips_move_locations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 72,
            description: "equipment_list_item_quantity",
            sql: include_str!("../migrations/0072_equipment_list_item_quantity.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 73,
            description: "user_instance_key_wrapper",
            sql: include_str!("../migrations/0073_user_instance_key_wrapper.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 74,
            description: "crew_availability",
            sql: include_str!("../migrations/0074_crew_availability.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 75,
            description: "script_sections_and_sides",
            sql: include_str!("../migrations/0075_script_sections_and_sides.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 76,
            description: "script_version_previous_revision",
            sql: include_str!("../migrations/0076_script_version_previous_revision.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 77,
            description: "script_section_ranges_user_edited",
            sql: include_str!("../migrations/0077_script_section_ranges_user_edited.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 78,
            description: "tax_credits",
            sql: include_str!("../migrations/0078_tax_credits.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 79,
            description: "vat_reclaim",
            sql: include_str!("../migrations/0079_vat_reclaim.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 80,
            description: "shots_consolidate_shot_description",
            sql: include_str!("../migrations/0080_shots_consolidate_shot_description.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 81,
            description: "vendors_is_global",
            sql: include_str!("../migrations/0081_vendors_is_global.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 82,
            description: "vendor_production_exclusions",
            sql: include_str!("../migrations/0082_vendor_production_exclusions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 83,
            description: "scenes_drop_heading",
            sql: include_str!("../migrations/0083_scenes_drop_heading.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 84,
            description: "scenes_day_night_expand",
            sql: include_str!("../migrations/0084_scenes_day_night_expand.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 85,
            description: "scenes_int_ext_clear_unk",
            sql: include_str!("../migrations/0085_scenes_int_ext_clear_unk.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 86,
            description: "sensitive_entity_field_encryption",
            sql: include_str!("../migrations/0086_sensitive_entity_field_encryption.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 87,
            description: "sync_v2_foundation",
            sql: include_str!("../migrations/0087_sync_v2_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 88,
            description: "vendor_po_allocations_and_amendments",
            sql: include_str!("../migrations/0088_vendor_po_allocations_and_amendments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 89,
            description: "expense_receipts",
            sql: include_str!("../migrations/0089_expense_receipts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 90,
            description: "vendor_po_currency_and_derived_approval",
            sql: include_str!("../migrations/0090_vendor_po_currency_and_derived_approval.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 91,
            description: "locations_contact_drop_permit_fee",
            sql: include_str!("../migrations/0091_locations_contact_drop_permit_fee.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 92,
            description: "risk_assessments",
            sql: include_str!("../migrations/0092_risk_assessments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 93,
            description: "script_supervisor_slates_takes",
            sql: include_str!("../migrations/0093_script_supervisor_slates_takes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 94,
            description: "script_supervisor_slating_system",
            sql: include_str!("../migrations/0094_script_supervisor_slating_system.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 95,
            description: "script_supervisor_scene_progress",
            sql: include_str!("../migrations/0095_script_supervisor_scene_progress.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 96,
            description: "script_supervisor_day_log",
            sql: include_str!("../migrations/0096_script_supervisor_day_log.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 97,
            description: "script_supervisor_lining",
            sql: include_str!("../migrations/0097_script_supervisor_lining.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 98,
            description: "script_supervisor_annotations_media",
            sql: include_str!("../migrations/0098_script_supervisor_annotations_media.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 99,
            description: "script_supervisor_revisions",
            sql: include_str!("../migrations/0099_script_supervisor_revisions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 100,
            description: "shoot_day_units_movement_order",
            sql: include_str!("../migrations/0100_shoot_day_units_movement_order.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 101,
            description: "shoot_days_movement_pins",
            sql: include_str!("../migrations/0101_shoot_days_movement_pins.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 102,
            description: "crew_hours",
            sql: include_str!("../migrations/0102_crew_hours.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 103,
            description: "crew_availability_cascade",
            sql: include_str!("../migrations/0103_crew_availability_cascade.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 104,
            description: "productions_production_code",
            sql: include_str!("../migrations/0104_productions_production_code.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 105,
            description: "script_breakdown",
            sql: include_str!("../migrations/0105_script_breakdown.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 106,
            description: "audit_logs",
            sql: include_str!("../migrations/0106_audit_logs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 107,
            description: "bookings_shoot_day_unit",
            sql: include_str!("../migrations/0107_bookings_shoot_day_unit.sql"),
            kind: MigrationKind::Up,
        },
    ];

    #[cfg_attr(mobile, allow(unused_mut))]
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            apf_desktop::on_second_instance(&app, &argv);
        }));
    }

    let app = builder
        .manage(sqlite_load::AlbatrossSqlMigrations(migrations))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            apf_desktop::pop_pending_apf_open_paths,
            apf_desktop::grant_read_access_for_apf,
            mail_compose::compose_mail_draft,
            db_encryption::get_local_db_status,
            db_encryption::get_pre_sqlcipher_backup_status,
            db_encryption::restore_sqlite_from_pre_sqlcipher_backup,
            db_encryption::get_instance_key_backup_status,
            db_encryption::backup_encrypted_db_before_rekey,
            db_encryption::restore_sqlite_from_instance_key_backup,
            db_encryption::discard_unopenable_setup_database,
            db_encryption::probe_sqlcipher_passphrase,
            db_encryption::migrate_plain_db_to_sqlcipher,
            db_encryption::rekey_sqlcipher_database,
            db_encryption::sqlcipher_self_test,
            sqlite_load::load_sqlite_with_passphrase,
            sqlite_load::run_sqlite_migrations,
            sqlite_load::execute_sqlite_transaction,
            open_route_service::get_driving_travel_time_minutes,
            open_route_service::get_route_summary,
            open_route_service::geocode_location_to_lat_lng,
            menu::set_budget_duplicate_live_as_draft_enabled,
            menu::set_active_menu_section,
        ])
        .setup(|app| {
            menu::setup(app)?;

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
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Must run between build (which registers the iOS app delegate) and run (UIApplicationMain).
    #[cfg(target_os = "ios")]
    apf_ios::install_open_url_hook();

    app.run(|_app_handle, _event| {
        #[cfg(target_os = "ios")]
        apf_ios::on_run_event(_app_handle, &_event);
    });
}
