//! Mobile stand-in for `menu.rs`. iOS/Android have no menu bar, so the frontend's menu-sync
//! commands are accepted and ignored; menu actions must be reachable from in-app UI instead.

#[tauri::command]
pub fn set_active_menu_section(_section: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn set_budget_duplicate_live_as_draft_enabled(_enabled: bool) -> Result<(), String> {
    Ok(())
}

pub fn setup(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
