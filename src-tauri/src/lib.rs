mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::image::resize_image,
            commands::image::convert_png_to_jpg,
            commands::file::write_image_file,
            commands::file::remove_image_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
