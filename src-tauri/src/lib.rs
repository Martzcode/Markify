use std::fs;
use std::path::PathBuf;

use tauri::menu::{
    CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItem, MenuItemBuilder,
    PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[cfg(target_os = "linux")]
use gtk::prelude::*;

const LANGUAGES: [(&str, &str); 4] = [
    ("fr", "Français"),
    ("en", "English"),
    ("es", "Español"),
    ("de", "Deutsch"),
];

struct MenuLabels {
    file: &'static str,
    edit: &'static str,
    tools: &'static str,
    preferences: &'static str,
    language: &'static str,
    open: &'static str,
    export_pdf: &'static str,
    quit: &'static str,
    undo: &'static str,
    redo: &'static str,
    cut: &'static str,
    copy: &'static str,
    paste: &'static str,
    select_all: &'static str,
}

fn menu_labels(lang: &str) -> MenuLabels {
    match lang {
        "fr" => MenuLabels {
            file: "Fichier",
            edit: "Édition",
            tools: "Outils",
            preferences: "Préférences",
            language: "Langue",
            open: "Ouvrir…",
            export_pdf: "Exporter en PDF…",
            quit: "Quitter",
            undo: "Annuler",
            redo: "Rétablir",
            cut: "Couper",
            copy: "Copier",
            paste: "Coller",
            select_all: "Tout sélectionner",
        },
        "es" => MenuLabels {
            file: "Archivo",
            edit: "Editar",
            tools: "Herramientas",
            preferences: "Preferencias",
            language: "Idioma",
            open: "Abrir…",
            export_pdf: "Exportar a PDF…",
            quit: "Salir",
            undo: "Deshacer",
            redo: "Rehacer",
            cut: "Cortar",
            copy: "Copiar",
            paste: "Pegar",
            select_all: "Seleccionar todo",
        },
        "de" => MenuLabels {
            file: "Datei",
            edit: "Bearbeiten",
            tools: "Extras",
            preferences: "Einstellungen",
            language: "Sprache",
            open: "Öffnen…",
            export_pdf: "Als PDF exportieren…",
            quit: "Beenden",
            undo: "Rückgängig",
            redo: "Wiederholen",
            cut: "Ausschneiden",
            copy: "Kopieren",
            paste: "Einfügen",
            select_all: "Alles auswählen",
        },
        _ => MenuLabels {
            file: "File",
            edit: "Edit",
            tools: "Tools",
            preferences: "Preferences",
            language: "Language",
            open: "Open…",
            export_pdf: "Export to PDF…",
            quit: "Quit",
            undo: "Undo",
            redo: "Redo",
            cut: "Cut",
            copy: "Copy",
            paste: "Paste",
            select_all: "Select All",
        },
    }
}

fn is_valid_lang(code: &str) -> bool {
    matches!(code, "fr" | "en" | "es" | "de")
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn language_from_settings(app: &AppHandle) -> String {
    let Ok(path) = settings_path(app) else {
        return "en".into();
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return "en".into();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return "en".into();
    };
    value
        .get("language")
        .and_then(|l| l.as_str())
        .filter(|code| is_valid_lang(code))
        .unwrap_or("en")
        .to_string()
}

fn save_language(app: &AppHandle, code: &str) -> Result<(), String> {
    let path = settings_path(app)?;
    let value = serde_json::json!({ "language": code });
    fs::write(path, serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[cfg(desktop)]
struct MenuHandles<R: Runtime> {
    file_menu: Submenu<R>,
    edit_menu: Submenu<R>,
    tools_menu: Submenu<R>,
    preferences_menu: Submenu<R>,
    language_menu: Submenu<R>,
    open_item: MenuItem<R>,
    export_item: MenuItem<R>,
    undo_item: PredefinedMenuItem<R>,
    redo_item: PredefinedMenuItem<R>,
    cut_item: PredefinedMenuItem<R>,
    copy_item: PredefinedMenuItem<R>,
    paste_item: PredefinedMenuItem<R>,
    select_all_item: PredefinedMenuItem<R>,
    quit_item: PredefinedMenuItem<R>,
    lang_items: Vec<CheckMenuItem<R>>,
}

#[cfg(desktop)]
fn build_menu<R: Runtime>(app: &AppHandle<R>, lang: &str) -> tauri::Result<MenuHandles<R>> {
    let labels = menu_labels(lang);

    let open_item = MenuItemBuilder::with_id("open", labels.open)
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let export_item = MenuItemBuilder::with_id("export", labels.export_pdf)
        .accelerator("CmdOrCtrl+E")
        .build(app)?;
    let undo_item = PredefinedMenuItem::undo(app, Some(labels.undo))?;
    let redo_item = PredefinedMenuItem::redo(app, Some(labels.redo))?;
    let cut_item = PredefinedMenuItem::cut(app, Some(labels.cut))?;
    let copy_item = PredefinedMenuItem::copy(app, Some(labels.copy))?;
    let paste_item = PredefinedMenuItem::paste(app, Some(labels.paste))?;
    let select_all_item = PredefinedMenuItem::select_all(app, Some(labels.select_all))?;
    let quit_item = PredefinedMenuItem::quit(app, Some(labels.quit))?;

    let file_menu = SubmenuBuilder::new(app, labels.file)
        .item(&open_item)
        .item(&export_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, labels.edit)
        .item(&undo_item)
        .item(&redo_item)
        .separator()
        .item(&cut_item)
        .item(&copy_item)
        .item(&paste_item)
        .separator()
        .item(&select_all_item)
        .build()?;

    let mut language_menu = SubmenuBuilder::new(app, labels.language);
    let mut lang_items = Vec::with_capacity(LANGUAGES.len());
    for (code, name) in LANGUAGES {
        let item = CheckMenuItemBuilder::with_id(format!("lang-{code}"), name)
            .checked(code == lang)
            .build(app)?;
        language_menu = language_menu.item(&item);
        lang_items.push(item);
    }
    let language_menu = language_menu.build()?;

    let preferences_menu = SubmenuBuilder::new(app, labels.preferences)
        .item(&language_menu)
        .build()?;

    let tools_menu = SubmenuBuilder::new(app, labels.tools)
        .item(&preferences_menu)
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&file_menu, &edit_menu, &tools_menu])
        .build()?;

    app.set_menu(menu)?;

    Ok(MenuHandles {
        file_menu,
        edit_menu,
        tools_menu,
        preferences_menu,
        language_menu,
        open_item,
        export_item,
        undo_item,
        redo_item,
        cut_item,
        copy_item,
        paste_item,
        select_all_item,
        quit_item,
        lang_items,
    })
}

#[cfg(desktop)]
fn apply_language<R: Runtime>(app: &AppHandle<R>, lang: &str) -> tauri::Result<()> {
    let labels = menu_labels(lang);
    let Some(handles) = app.try_state::<MenuHandles<R>>() else {
        return Ok(());
    };
    handles.file_menu.set_text(labels.file)?;
    handles.edit_menu.set_text(labels.edit)?;
    handles.tools_menu.set_text(labels.tools)?;
    handles.preferences_menu.set_text(labels.preferences)?;
    handles.language_menu.set_text(labels.language)?;
    handles.open_item.set_text(labels.open)?;
    handles.export_item.set_text(labels.export_pdf)?;
    handles.undo_item.set_text(labels.undo)?;
    handles.redo_item.set_text(labels.redo)?;
    handles.cut_item.set_text(labels.cut)?;
    handles.copy_item.set_text(labels.copy)?;
    handles.paste_item.set_text(labels.paste)?;
    handles.select_all_item.set_text(labels.select_all)?;
    handles.quit_item.set_text(labels.quit)?;
    for ((code, _), item) in LANGUAGES.iter().zip(&handles.lang_items) {
        item.set_checked(*code == lang)?;
    }
    #[cfg(target_os = "linux")]
    update_menubar_root_labels(app, &labels);
    Ok(())
}

#[cfg(target_os = "linux")]
fn find_gtk_menubar(win: &gtk::ApplicationWindow) -> Option<gtk::MenuBar> {
    let mut stack = win.children();
    while let Some(w) = stack.pop() {
        if let Ok(menubar) = w.clone().downcast::<gtk::MenuBar>() {
            return Some(menubar);
        }
        if let Ok(container) = w.clone().downcast::<gtk::Container>() {
            stack.extend(container.children());
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn set_submenu_label(item: &gtk::MenuItem, text: &str) {
    if let Some(child) = item.child() {
        if let Ok(box_) = child.downcast::<gtk::Box>() {
            for w in box_.children() {
                if let Ok(label) = w.downcast::<gtk::AccelLabel>() {
                    label.set_text(text);
                    label.set_use_underline(true);
                    return;
                }
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn update_menubar_root_labels<R: Runtime>(app: &AppHandle<R>, labels: &MenuLabels) {
    let Some(webview) = app.get_webview_window("main") else {
        return;
    };
    let Ok(gtk_window) = webview.gtk_window() else {
        return;
    };
    let Some(menubar) = find_gtk_menubar(&gtk_window) else {
        println!("[menu] gtk menubar not found");
        return;
    };
    let items: Vec<gtk::MenuItem> = menubar
        .children()
        .into_iter()
        .filter_map(|w| w.downcast::<gtk::MenuItem>().ok())
        .collect();
    if items.len() >= 3 {
        set_submenu_label(&items[0], labels.file);
        set_submenu_label(&items[1], labels.edit);
        set_submenu_label(&items[2], labels.tools);
        println!("[menu] root labels updated");
    } else {
        println!("[menu] menubar has {} items", items.len());
    }
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

#[tauri::command]
fn log_front(msg: String) {
    println!("[webview] {msg}");
}

#[tauri::command]
fn get_language(app: AppHandle) -> String {
    language_from_settings(&app)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            #[cfg(desktop)]
            {
                let lang = language_from_settings(app.handle());
                let handles = build_menu(app.handle(), &lang)?;
                app.manage(handles);
                app.on_menu_event(|app, event| {
                    let id = event.id().as_ref().to_string();
                    println!("[menu] event: {id}");
                    match id.as_str() {
                        "open" => {
                            let _ = app.emit("menu-open", ());
                        }
                        "export" => {
                            let _ = app.emit("menu-export", ());
                        }
                        _ if id.starts_with("lang-") => {
                            let code = id.trim_start_matches("lang-").to_string();
                            match save_language(app, &code) {
                                Ok(()) => println!("[menu] language saved: {code}"),
                                Err(e) => println!("[menu] FAILED to save language: {e}"),
                            }
                            match apply_language(app, &code) {
                                Ok(()) => println!("[menu] menu updated to: {code}"),
                                Err(e) => println!("[menu] FAILED to update menu: {e}"),
                            }
                            let _ = app.emit("language-changed", code);
                            println!("[menu] language-changed emitted");
                        }
                        _ => {}
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file_content,
            write_file,
            get_language,
            log_front
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
