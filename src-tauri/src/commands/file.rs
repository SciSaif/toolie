use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileRequest {
    path: String,
    data: String,
}

#[tauri::command]
pub fn write_image_file(request: WriteFileRequest) -> Result<(), String> {
    let bytes = STANDARD
        .decode(request.data.trim())
        .map_err(|error| format!("Invalid file data: {error}"))?;

    let path = Path::new(&request.path);
    if path.parent().is_some_and(|parent| !parent.exists()) {
        return Err("Target folder does not exist.".to_string());
    }

    std::fs::write(path, bytes).map_err(|error| format!("Failed to write file: {error}"))
}

#[tauri::command]
pub fn remove_image_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|error| format!("Failed to remove file: {error}"))
}
