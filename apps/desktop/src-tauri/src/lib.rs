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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ammo_speeds: Option<std::collections::HashMap<String, f64>>,
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

const SETTINGS_VERSION: u32 = 1;
const SETTINGS_DIR_NAME: &str = "wt-sights-editor";

fn default_settings_version() -> u32 {
    SETTINGS_VERSION
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(default = "default_settings_version")]
    version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    user_sights_path: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            user_sights_path: None,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LoadedAppSettings {
    version: u32,
    user_sights_path: Option<String>,
    user_sights_path_exists: bool,
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

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().config_dir().map_err(|err| err.to_string())?;
    Ok(dir.join(SETTINGS_DIR_NAME).join("settings.json"))
}

fn user_sights_dir_exists(path: Option<&str>) -> bool {
    path.is_some_and(|value| Path::new(value).is_dir())
}

#[tauri::command]
fn load_app_settings(app: AppHandle) -> Result<LoadedAppSettings, String> {
    let path = settings_path(&app)?;
    let settings = if path.is_file() {
        let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
        serde_json::from_str(&text).map_err(|err| err.to_string())?
    } else {
        AppSettings::default()
    };
    Ok(LoadedAppSettings {
        user_sights_path_exists: user_sights_dir_exists(settings.user_sights_path.as_deref()),
        version: settings.version,
        user_sights_path: settings.user_sights_path,
    })
}

#[tauri::command]
fn save_app_settings(app: AppHandle, mut settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    if settings.version == 0 {
        settings.version = SETTINGS_VERSION;
    }
    let text = serde_json::to_string_pretty(&settings).map_err(|err| err.to_string())?;
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

fn is_global_blk(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("global.blk"))
}

#[tauri::command]
fn resolve_global_blk(user_sights: String) -> Result<Option<String>, String> {
    let root = PathBuf::from(user_sights);
    let parent = match root.parent() {
        Some(path) => path,
        None => return Ok(None),
    };
    let global = parent.join("global.blk");
    if global.is_file() {
        Ok(Some(global.to_string_lossy().into_owned()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let dest = PathBuf::from(&path);
    if !is_global_blk(&dest) {
        return Err("only global.blk can be read".into());
    }
    fs::read_to_string(dest).map_err(|err| err.to_string())
}

#[tauri::command]
fn write_global_blk(path: String, contents: String) -> Result<(), String> {
    let dest = PathBuf::from(&path);
    if !is_global_blk(&dest) {
        return Err("only global.blk can be written".into());
    }
    if !dest.is_file() {
        return Err("global.blk does not exist".into());
    }
    let bak = dest.with_file_name("global.blk.wtse.bak");
    if !bak.exists() {
        fs::copy(&dest, &bak).map_err(|err| err.to_string())?;
    }
    fs::write(&dest, contents).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_tank_sights(root: String, tank_id: String) -> Result<Vec<String>, String> {
    if tank_id.is_empty()
        || tank_id == "."
        || tank_id.contains('/')
        || tank_id.contains('\\')
        || tank_id.contains("..")
    {
        return Err("invalid tank id".into());
    }
    let dir = safe_join(Path::new(&root), &tank_id)?;
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if let Some(stem) = name.strip_suffix(".blk") {
            if !stem.is_empty() {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_user_extras,
            save_user_extras,
            load_app_settings,
            save_app_settings,
            write_sight_files,
            resolve_global_blk,
            read_text_file,
            write_global_blk,
            list_tank_sights
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
