use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CatalogTank {
    id: String,
    country: String,
    name_en: String,
    name_ru: String,
    zoom_min: f64,
    zoom_max: f64,
    sights: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedFile {
    relative_path: String,
    contents: String,
}

#[derive(Serialize)]
struct WriteResult {
    count: usize,
    root: String,
}

fn extras_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir.join("user-catalog.json"))
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.is_absolute() {
        return Err("absolute paths are not allowed".into());
    }
    for component in rel.components() {
        if matches!(component, Component::ParentDir | Component::Prefix(_)) {
            return Err("invalid relative path".into());
        }
    }
    Ok(root.join(rel))
}

#[tauri::command]
fn load_user_extras(app: AppHandle) -> Result<Vec<CatalogTank>, String> {
    let path = extras_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text).map_err(|err| err.to_string())
}

#[tauri::command]
fn save_user_extras(app: AppHandle, tanks: Vec<CatalogTank>) -> Result<(), String> {
    let path = extras_path(&app)?;
    let text = serde_json::to_string_pretty(&tanks).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
}

#[tauri::command]
fn write_sight_files(root: String, files: Vec<GeneratedFile>) -> Result<WriteResult, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err("UserSights folder does not exist".into());
    }
    for file in &files {
        let dest = safe_join(&root_path, &file.relative_path)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        fs::write(dest, &file.contents).map_err(|err| err.to_string())?;
    }
    Ok(WriteResult {
        count: files.len(),
        root,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_user_extras,
            save_user_extras,
            write_sight_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
