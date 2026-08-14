#[tauri::command]
fn read_markdown_file(path: String) -> Result<String, String> {
  std::fs::read_to_string(&path).map_err(|err| err.to_string())
}

#[tauri::command]
fn write_markdown_file(path: String, content: String) -> Result<(), String> {
  std::fs::write(&path, content).map_err(|err| err.to_string())
}

#[tauri::command]
fn write_pdf_file(path: String, content: Vec<u8>) -> Result<(), String> {
  std::fs::write(&path, content).map_err(|err| err.to_string())
}

#[tauri::command]
fn read_image_base64(path: String) -> Result<String, String> {
  use base64::Engine;
  let bytes = std::fs::read(&path).map_err(|err| err.to_string())?;
  Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let context = tauri::generate_context!();

  #[cfg(target_os = "linux")]
  {
    // The Wayland app id (used by KDE/GNOME to resolve the taskbar icon
    // from the .desktop file) falls back to the GLib prgname. Set it to the
    // app identifier so it matches "<identifier>.desktop".
    gtk::glib::set_prgname(Some(&context.config().identifier));
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_http::init())
    .invoke_handler(tauri::generate_handler![
      read_markdown_file,
      write_markdown_file,
      write_pdf_file,
      read_image_base64
    ])
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
    .run(context)
    .expect("error while running tauri application");
}
