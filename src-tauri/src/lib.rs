mod apf_desktop;
mod open_route_service;

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

const MENU_ID_DUPLICATE_LIVE_AS_DRAFT: &str = "budget_duplicate_live_as_draft";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveMenuSection {
    None,
    People,
    Budget,
    Schedule,
    Tasks,
    Locations,
    Documents,
    Deliverables,
}

impl ActiveMenuSection {
    fn from_value(value: &str) -> Self {
        match value {
            "people" => Self::People,
            "budget" => Self::Budget,
            "schedule" => Self::Schedule,
            "tasks" => Self::Tasks,
            "locations" => Self::Locations,
            "documents" => Self::Documents,
            "deliverables" => Self::Deliverables,
            _ => Self::None,
        }
    }
}

struct AppMenuState {
    duplicate_live_as_draft_item: std::sync::Mutex<Option<tauri::menu::MenuItem<tauri::Wry>>>,
    active_section: std::sync::Mutex<ActiveMenuSection>,
}

#[tauri::command]
fn set_active_menu_section(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppMenuState>,
    section: String,
) -> Result<(), String> {
    let next = ActiveMenuSection::from_value(&section);
    {
        let mut guard = state
            .active_section
            .lock()
            .map_err(|_| "active section lock poisoned".to_string())?;
        *guard = next;
    }
    rebuild_menu(&app_handle, &state, next)
}

#[tauri::command]
fn set_budget_duplicate_live_as_draft_enabled(
    _app_handle: tauri::AppHandle,
    state: tauri::State<AppMenuState>,
    enabled: bool,
) -> Result<(), String> {
    let guard = state
        .duplicate_live_as_draft_item
        .lock()
        .map_err(|_| "budget menu item lock poisoned".to_string())?;
    if let Some(item) = guard.as_ref() {
        item.set_enabled(enabled).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn rebuild_menu(
    app: &tauri::AppHandle,
    state: &tauri::State<AppMenuState>,
    section: ActiveMenuSection,
) -> Result<(), String> {
    let import_item = MenuItemBuilder::with_id("import_project", "Import Project...")
        .accelerator("CmdOrCtrl+O")
        .build(app)
        .map_err(|err| err.to_string())?;
    let export_item = MenuItemBuilder::with_id("export_project", "Export Project...")
        .accelerator("CmdOrCtrl+Shift+E")
        .build(app)
        .map_err(|err| err.to_string())?;
    let new_project_item = MenuItemBuilder::with_id("new_project", "New Project...")
        .accelerator("CmdOrCtrl+N")
        .build(app)
        .map_err(|err| err.to_string())?;
    let app_settings_item = MenuItemBuilder::with_id("app_settings", "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)
        .map_err(|err| err.to_string())?;
    let no_recent_item = MenuItemBuilder::with_id("no_recent_projects", "No Recent Projects")
        .enabled(false)
        .build(app)
        .map_err(|err| err.to_string())?;

    let open_recent_menu = SubmenuBuilder::new(app, "Open Recent")
        .item(&no_recent_item)
        .build()
        .map_err(|err| err.to_string())?;

    let app_submenu = SubmenuBuilder::new(app, "Albatross")
        .item(&PredefinedMenuItem::about(app, None, None).map_err(|err| err.to_string())?)
        .item(&app_settings_item)
        .separator()
        .item(&PredefinedMenuItem::services(app, None).map_err(|err| err.to_string())?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None).map_err(|err| err.to_string())?)
        .item(&PredefinedMenuItem::hide_others(app, None).map_err(|err| err.to_string())?)
        .item(&PredefinedMenuItem::show_all(app, None).map_err(|err| err.to_string())?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None).map_err(|err| err.to_string())?)
        .build()
        .map_err(|err| err.to_string())?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_project_item)
        .separator()
        .item(&import_item)
        .item(&export_item)
        .separator()
        .item(&open_recent_menu)
        .build()
        .map_err(|err| err.to_string())?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::cut(app, None).map_err(|err| err.to_string())?)
        .item(&PredefinedMenuItem::copy(app, None).map_err(|err| err.to_string())?)
        .item(&PredefinedMenuItem::paste(app, None).map_err(|err| err.to_string())?)
        .separator()
        .item(&PredefinedMenuItem::select_all(app, None).map_err(|err| err.to_string())?)
        .build()
        .map_err(|err| err.to_string())?;

    let view_go_dashboard = MenuItemBuilder::with_id("view_go_dashboard", "Dashboard")
        .accelerator("CmdOrCtrl+1")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_productions = MenuItemBuilder::with_id("view_go_productions", "Productions")
        .accelerator("CmdOrCtrl+2")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_budget = MenuItemBuilder::with_id("view_go_budget", "Budget")
        .accelerator("CmdOrCtrl+3")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_schedule = MenuItemBuilder::with_id("view_go_schedule", "Schedule")
        .accelerator("CmdOrCtrl+4")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_people = MenuItemBuilder::with_id("view_go_people", "People")
        .accelerator("CmdOrCtrl+5")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_locations = MenuItemBuilder::with_id("view_go_locations", "Locations")
        .accelerator("CmdOrCtrl+6")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_documents = MenuItemBuilder::with_id("view_go_documents", "Documents")
        .accelerator("CmdOrCtrl+7")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_deliverables = MenuItemBuilder::with_id("view_go_deliverables", "Deliverables")
        .accelerator("CmdOrCtrl+8")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_tasks = MenuItemBuilder::with_id("view_go_tasks", "Tasks")
        .accelerator("CmdOrCtrl+9")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_toggle_sidebar = MenuItemBuilder::with_id("view_toggle_sidebar", "Toggle Sidebar")
        .accelerator("CmdOrCtrl+B")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .items(&[
            &view_go_dashboard,
            &view_go_productions,
            &view_go_budget,
            &view_go_schedule,
            &view_go_people,
            &view_go_locations,
            &view_go_documents,
            &view_go_deliverables,
            &view_go_tasks,
            &view_toggle_sidebar,
        ])
        .build()
        .map_err(|err| err.to_string())?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None).map_err(|err| err.to_string())?)
        .item(&PredefinedMenuItem::maximize(app, None).map_err(|err| err.to_string())?)
        .item(&PredefinedMenuItem::fullscreen(app, None).map_err(|err| err.to_string())?)
        .build()
        .map_err(|err| err.to_string())?;

    let help_docs = MenuItemBuilder::with_id("help_getting_started", "Getting Started")
        .build(app)
        .map_err(|err| err.to_string())?;
    let help_shortcuts = MenuItemBuilder::with_id("help_keyboard_shortcuts", "Keyboard Shortcuts")
        .build(app)
        .map_err(|err| err.to_string())?;
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&help_docs)
        .item(&help_shortcuts)
        .build()
        .map_err(|err| err.to_string())?;

    let mut top_level: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        vec![&app_submenu, &file_menu, &edit_menu, &view_menu];
    let mut duplicate_item_for_state: Option<tauri::menu::MenuItem<tauri::Wry>> = None;
    let section_menu = match section {
        ActiveMenuSection::People => {
            let add_cast = MenuItemBuilder::with_id("people_add_cast", "Add Cast...")
                .accelerator("CmdOrCtrl+Shift+C")
                .build(app)
                .map_err(|err| err.to_string())?;
            let add_crew = MenuItemBuilder::with_id("people_add_crew", "Add Crew...")
                .accelerator("CmdOrCtrl+Shift+R")
                .build(app)
                .map_err(|err| err.to_string())?;
            let add_booking = MenuItemBuilder::with_id("people_add_booking", "Add Booking...")
                .accelerator("CmdOrCtrl+Shift+K")
                .build(app)
                .map_err(|err| err.to_string())?;
            let open_cast = MenuItemBuilder::with_id("people_open_cast_manager", "Open Cast Manager")
                .build(app)
                .map_err(|err| err.to_string())?;
            let open_crew = MenuItemBuilder::with_id("people_open_crew_manager", "Open Crew Manager")
                .build(app)
                .map_err(|err| err.to_string())?;
            Some(
                SubmenuBuilder::new(app, "People")
                    .items(&[&add_cast, &add_crew, &add_booking, &open_cast, &open_crew])
                    .build()
                    .map_err(|err| err.to_string())?,
            )
        }
        ActiveMenuSection::Budget => {
            let log_spend = MenuItemBuilder::with_id("budget_log_spend", "Log Spend...")
                .accelerator("CmdOrCtrl+Shift+L")
                .build(app)
                .map_err(|err| err.to_string())?;
            let add_line_item = MenuItemBuilder::with_id("budget_add_line_item", "Add Line Item...")
                .accelerator("CmdOrCtrl+Shift+I")
                .build(app)
                .map_err(|err| err.to_string())?;
            let manage_revisions = MenuItemBuilder::with_id("budget_manage_revisions", "Manage Revisions...")
                .build(app)
                .map_err(|err| err.to_string())?;
            let export_csv = MenuItemBuilder::with_id("budget_export_csv", "Export Budget CSV...")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)
                .map_err(|err| err.to_string())?;
            let duplicate_live = MenuItemBuilder::with_id(
                MENU_ID_DUPLICATE_LIVE_AS_DRAFT,
                "Duplicate live as draft",
            )
            .enabled(
                state
                    .duplicate_live_as_draft_item
                    .lock()
                    .map_err(|_| "budget menu item lock poisoned".to_string())?
                    .as_ref()
                    .and_then(|item| item.is_enabled().ok())
                    .unwrap_or(false),
            )
            .build(app)
            .map_err(|err| err.to_string())?;
            duplicate_item_for_state = Some(duplicate_live.clone());
            Some(
                SubmenuBuilder::new(app, "Budget")
                    .items(&[
                        &log_spend,
                        &add_line_item,
                        &manage_revisions,
                        &export_csv,
                        &duplicate_live,
                    ])
                    .build()
                    .map_err(|err| err.to_string())?,
            )
        }
        ActiveMenuSection::Schedule => {
            let new_shoot_day = MenuItemBuilder::with_id("schedule_new_shoot_day", "New Shoot Day...")
                .accelerator("CmdOrCtrl+Shift+D")
                .build(app)
                .map_err(|err| err.to_string())?;
            let add_strip = MenuItemBuilder::with_id("schedule_add_strip", "Add Strip...")
                .accelerator("CmdOrCtrl+Shift+T")
                .build(app)
                .map_err(|err| err.to_string())?;
            let open_stripboard =
                MenuItemBuilder::with_id("schedule_open_stripboard", "Open Stripboard")
                    .build(app)
                    .map_err(|err| err.to_string())?;
            let open_shot_list = MenuItemBuilder::with_id("schedule_open_shot_list", "Open Shot List")
                .build(app)
                .map_err(|err| err.to_string())?;
            let parse_script =
                MenuItemBuilder::with_id("schedule_parse_script_scenes", "Parse Script Scenes...")
                    .build(app)
                    .map_err(|err| err.to_string())?;
            Some(
                SubmenuBuilder::new(app, "Schedule")
                    .items(&[
                        &new_shoot_day,
                        &add_strip,
                        &open_stripboard,
                        &open_shot_list,
                        &parse_script,
                    ])
                    .build()
                    .map_err(|err| err.to_string())?,
            )
        }
        ActiveMenuSection::Tasks => {
            let new_task = MenuItemBuilder::with_id("tasks_new_task", "New Task...")
                .accelerator("CmdOrCtrl+T")
                .build(app)
                .map_err(|err| err.to_string())?;
            Some(
                SubmenuBuilder::new(app, "Tasks")
                    .items(&[&new_task])
                    .build()
                    .map_err(|err| err.to_string())?,
            )
        }
        ActiveMenuSection::Locations => {
            let add_location = MenuItemBuilder::with_id("locations_add_location", "Add Location...")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(app)
                .map_err(|err| err.to_string())?;
            Some(
                SubmenuBuilder::new(app, "Locations")
                    .items(&[&add_location])
                    .build()
                    .map_err(|err| err.to_string())?,
            )
        }
        ActiveMenuSection::Documents => {
            let upload_file = MenuItemBuilder::with_id("documents_upload_file", "Upload File...")
                .accelerator("CmdOrCtrl+U")
                .build(app)
                .map_err(|err| err.to_string())?;
            let export_bundle =
                MenuItemBuilder::with_id("documents_export_bundle", "Export Document Bundle...")
                    .enabled(false)
                    .build(app)
                    .map_err(|err| err.to_string())?;
            Some(
                SubmenuBuilder::new(app, "Documents")
                    .items(&[&upload_file, &export_bundle])
                    .build()
                    .map_err(|err| err.to_string())?,
            )
        }
        ActiveMenuSection::Deliverables => {
            let add_deliverable =
                MenuItemBuilder::with_id("deliverables_add_deliverable", "Add Deliverable...")
                    .accelerator("CmdOrCtrl+Shift+V")
                    .build(app)
                    .map_err(|err| err.to_string())?;
            let apply_template =
                MenuItemBuilder::with_id("deliverables_apply_template", "Apply Template...")
                    .build(app)
                    .map_err(|err| err.to_string())?;
            let export_manifest =
                MenuItemBuilder::with_id("deliverables_export_manifest", "Export Deliverables Manifest...")
                    .enabled(false)
                    .build(app)
                    .map_err(|err| err.to_string())?;
            Some(
                SubmenuBuilder::new(app, "Deliverables")
                    .items(&[&add_deliverable, &apply_template, &export_manifest])
                    .build()
                    .map_err(|err| err.to_string())?,
            )
        }
        ActiveMenuSection::None => None,
    };
    if let Some(section_menu) = section_menu.as_ref() {
        top_level.push(section_menu);
    }

    top_level.push(&window_menu);
    top_level.push(&help_menu);

    let menu = MenuBuilder::new(app)
        .items(&top_level)
        .build()
        .map_err(|err| err.to_string())?;
    app.set_menu(menu).map_err(|err| err.to_string())?;

    {
        let mut guard = state
            .duplicate_live_as_draft_item
            .lock()
            .map_err(|_| "budget menu item lock poisoned".to_string())?;
        *guard = duplicate_item_for_state;
    }

    Ok(())
}

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
            set_budget_duplicate_live_as_draft_enabled,
            set_active_menu_section,
        ])
        .setup(|app| {
            let duplicate_live_as_draft_item =
                MenuItemBuilder::with_id(MENU_ID_DUPLICATE_LIVE_AS_DRAFT, "Duplicate live as draft")
                    .enabled(false)
                    .build(app)?;
            app.manage(AppMenuState {
                duplicate_live_as_draft_item: std::sync::Mutex::new(Some(duplicate_live_as_draft_item)),
                active_section: std::sync::Mutex::new(ActiveMenuSection::None),
            });
            let state: tauri::State<AppMenuState> = app.state();
            rebuild_menu(&app.handle(), &state, ActiveMenuSection::None)
                .map_err(|err| -> Box<dyn std::error::Error> { err.into() })?;

            app.on_menu_event(move |app_handle: &tauri::AppHandle, event| match event.id().0.as_str() {
                "import_project" => {
                    let _ = app_handle.emit("albatross-menu-import-project", ());
                }
                "export_project" => {
                    let _ = app_handle.emit("albatross-menu-export-project", ());
                }
                "new_project" => {
                    let _ = app_handle.emit("albatross-menu-new-project", ());
                }
                "app_settings" => {
                    let _ = app_handle.emit("albatross-menu-open-settings", ());
                }
                "view_go_dashboard" => {
                    let _ = app_handle.emit("albatross-menu-view-go-dashboard", ());
                }
                "view_go_productions" => {
                    let _ = app_handle.emit("albatross-menu-view-go-productions", ());
                }
                "view_go_budget" => {
                    let _ = app_handle.emit("albatross-menu-view-go-budget", ());
                }
                "view_go_schedule" => {
                    let _ = app_handle.emit("albatross-menu-view-go-schedule", ());
                }
                "view_go_people" => {
                    let _ = app_handle.emit("albatross-menu-view-go-people", ());
                }
                "view_go_locations" => {
                    let _ = app_handle.emit("albatross-menu-view-go-locations", ());
                }
                "view_go_documents" => {
                    let _ = app_handle.emit("albatross-menu-view-go-documents", ());
                }
                "view_go_deliverables" => {
                    let _ = app_handle.emit("albatross-menu-view-go-deliverables", ());
                }
                "view_go_tasks" => {
                    let _ = app_handle.emit("albatross-menu-view-go-tasks", ());
                }
                "view_toggle_sidebar" => {
                    let _ = app_handle.emit("albatross-menu-view-toggle-sidebar", ());
                }
                MENU_ID_DUPLICATE_LIVE_AS_DRAFT => {
                    let _ = app_handle.emit("albatross-menu-duplicate-live-as-draft", ());
                }
                "people_add_cast" => {
                    let _ = app_handle.emit("albatross-menu-people-add-cast", ());
                }
                "people_add_crew" => {
                    let _ = app_handle.emit("albatross-menu-people-add-crew", ());
                }
                "people_add_booking" => {
                    let _ = app_handle.emit("albatross-menu-people-add-booking", ());
                }
                "people_open_cast_manager" => {
                    let _ = app_handle.emit("albatross-menu-people-open-cast-manager", ());
                }
                "people_open_crew_manager" => {
                    let _ = app_handle.emit("albatross-menu-people-open-crew-manager", ());
                }
                "budget_log_spend" => {
                    let _ = app_handle.emit("albatross-menu-budget-log-spend", ());
                }
                "budget_add_line_item" => {
                    let _ = app_handle.emit("albatross-menu-budget-add-line-item", ());
                }
                "budget_manage_revisions" => {
                    let _ = app_handle.emit("albatross-menu-budget-manage-revisions", ());
                }
                "budget_export_csv" => {
                    let _ = app_handle.emit("albatross-menu-budget-export-csv", ());
                }
                "schedule_new_shoot_day" => {
                    let _ = app_handle.emit("albatross-menu-schedule-new-shoot-day", ());
                }
                "schedule_add_strip" => {
                    let _ = app_handle.emit("albatross-menu-schedule-add-strip", ());
                }
                "schedule_open_stripboard" => {
                    let _ = app_handle.emit("albatross-menu-schedule-open-stripboard", ());
                }
                "schedule_open_shot_list" => {
                    let _ = app_handle.emit("albatross-menu-schedule-open-shot-list", ());
                }
                "schedule_parse_script_scenes" => {
                    let _ = app_handle.emit("albatross-menu-schedule-parse-script-scenes", ());
                }
                "tasks_new_task" => {
                    let _ = app_handle.emit("albatross-menu-tasks-new-task", ());
                }
                "locations_add_location" => {
                    let _ = app_handle.emit("albatross-menu-locations-add-location", ());
                }
                "documents_upload_file" => {
                    let _ = app_handle.emit("albatross-menu-documents-upload-file", ());
                }
                "deliverables_add_deliverable" => {
                    let _ = app_handle.emit("albatross-menu-deliverables-add-deliverable", ());
                }
                "deliverables_apply_template" => {
                    let _ = app_handle.emit("albatross-menu-deliverables-apply-template", ());
                }
                _ => {}
            });

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

