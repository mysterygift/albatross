//! Native desktop menu bar. iOS/Android have no menu bar; see `menu_mobile.rs`.
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

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

pub struct AppMenuState {
    duplicate_live_as_draft_item: std::sync::Mutex<Option<tauri::menu::MenuItem<tauri::Wry>>>,
    active_section: std::sync::Mutex<ActiveMenuSection>,
}

#[tauri::command]
pub fn set_active_menu_section(
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
pub fn set_budget_duplicate_live_as_draft_enabled(
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
    let import_item = MenuItemBuilder::with_id("import_project", "Import Production...")
        .accelerator("CmdOrCtrl+O")
        .build(app)
        .map_err(|err| err.to_string())?;
    let export_item = MenuItemBuilder::with_id("export_project", "Export Production...")
        .accelerator("CmdOrCtrl+Shift+E")
        .build(app)
        .map_err(|err| err.to_string())?;
    let publish_server_item = MenuItemBuilder::with_id("publish_to_server", "Publish to Server…")
        .build(app)
        .map_err(|err| err.to_string())?;
    let new_project_item = MenuItemBuilder::with_id("new_project", "New Production...")
        .accelerator("CmdOrCtrl+N")
        .build(app)
        .map_err(|err| err.to_string())?;
    let app_settings_item = MenuItemBuilder::with_id("app_settings", "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)
        .map_err(|err| err.to_string())?;
    let file_logout_item = MenuItemBuilder::with_id("file_logout", "Log Out")
        .build(app)
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
        .item(&publish_server_item)
        .separator()
        .item(&file_logout_item)
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
    let view_go_call_sheets = MenuItemBuilder::with_id("view_go_call_sheets", "Call Sheets")
        .accelerator("CmdOrCtrl+Alt+1")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_movement_orders = MenuItemBuilder::with_id("view_go_movement_orders", "Movement Orders")
        .accelerator("CmdOrCtrl+Alt+2")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_equipment = MenuItemBuilder::with_id("view_go_equipment", "Equipment")
        .accelerator("CmdOrCtrl+Alt+3")
        .build(app)
        .map_err(|err| err.to_string())?;
    let view_go_music_clearance = MenuItemBuilder::with_id("view_go_music_clearance", "Music & Archive")
        .accelerator("CmdOrCtrl+Alt+4")
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
            &view_go_call_sheets,
            &view_go_movement_orders,
            &view_go_equipment,
            &view_go_music_clearance,
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

/// Builds the initial menu and wires menu clicks to frontend events.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
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
        "publish_to_server" => {
            let _ = app_handle.emit("albatross-menu-publish-to-server", ());
        }
        "new_project" => {
            let _ = app_handle.emit("albatross-menu-new-project", ());
        }
        "app_settings" => {
            let _ = app_handle.emit("albatross-menu-open-settings", ());
        }
        "file_logout" => {
            let _ = app_handle.emit("albatross-menu-logout", ());
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
        "view_go_call_sheets" => {
            let _ = app_handle.emit("albatross-menu-view-go-call-sheets", ());
        }
        "view_go_movement_orders" => {
            let _ = app_handle.emit("albatross-menu-view-go-movement-orders", ());
        }
        "view_go_equipment" => {
            let _ = app_handle.emit("albatross-menu-view-go-equipment", ());
        }
        "view_go_music_clearance" => {
            let _ = app_handle.emit("albatross-menu-view-go-music-clearance", ());
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
        "help_getting_started" => {
            let _ = app_handle.emit("albatross-menu-help-getting-started", ());
        }
        "help_keyboard_shortcuts" => {
            let _ = app_handle.emit("albatross-menu-help-keyboard-shortcuts", ());
        }
        _ => {}
    });

    Ok(())
}
