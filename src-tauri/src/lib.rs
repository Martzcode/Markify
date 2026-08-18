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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfFontFile {
  role: String,
  base64: String,
}

const FONT_ROLES: [&str; 4] = ["normal", "bold", "italics", "bolditalics"];

#[derive(Clone, Copy)]
struct FontFamily {
  normal: &'static [&'static str],
  bold: &'static [&'static str],
  italics: &'static [&'static str],
  bolditalics: &'static [&'static str],
}

const FONT_FAMILIES: [FontFamily; 9] = [
  FontFamily {
    normal: &["inter-regular.ttf", "inter-regular.otf"],
    bold: &["inter-bold.ttf", "inter-bold.otf"],
    italics: &["inter-italic.ttf", "inter-italic.otf"],
    bolditalics: &["inter-bolditalic.ttf", "inter-bolditalic.otf"],
  },
  FontFamily {
    normal: &["adwaitasans-regular.ttf"],
    bold: &[],
    italics: &["adwaitasans-italic.ttf"],
    bolditalics: &[],
  },
  FontFamily {
    normal: &["notosans-regular.ttf", "notosans-regular.otf"],
    bold: &["notosans-bold.ttf", "notosans-bold.otf"],
    italics: &["notosans-italic.ttf", "notosans-italic.otf"],
    bolditalics: &["notosans-bolditalic.ttf", "notosans-bolditalic.otf"],
  },
  FontFamily {
    normal: &["dejavusans.ttf"],
    bold: &["dejavusans-bold.ttf"],
    italics: &["dejavusans-oblique.ttf"],
    bolditalics: &["dejavusans-boldoblique.ttf"],
  },
  FontFamily {
    normal: &["liberationsans-regular.ttf", "liberationsans-regular.otf"],
    bold: &["liberationsans-bold.ttf", "liberationsans-bold.otf"],
    italics: &["liberationsans-italic.ttf", "liberationsans-italic.otf"],
    bolditalics: &["liberationsans-bolditalic.ttf", "liberationsans-bolditalic.otf"],
  },
  FontFamily {
    normal: &["freesans.ttf", "freesans.otf"],
    bold: &["freesansbold.ttf", "freesansbold.otf"],
    italics: &["freesansoblique.ttf", "freesansoblique.otf"],
    bolditalics: &["freesansboldoblique.ttf", "freesansboldoblique.otf"],
  },
  FontFamily {
    normal: &["symbola.ttf", "symbola.otf"],
    bold: &["symbola.ttf", "symbola.otf"],
    italics: &["symbola.ttf", "symbola.otf"],
    bolditalics: &["symbola.ttf", "symbola.otf"],
  },
  FontFamily {
    normal: &["arial.ttf"],
    bold: &["arialbd.ttf"],
    italics: &["ariali.ttf"],
    bolditalics: &["arialbi.ttf"],
  },
  FontFamily {
    normal: &["arialunicode.ttf", "arial unicode.ttf"],
    bold: &["arialunicode.ttf", "arial unicode.ttf"],
    italics: &["arialunicode.ttf", "arial unicode.ttf"],
    bolditalics: &["arialunicode.ttf", "arial unicode.ttf"],
  },
];

fn font_dirs() -> Vec<std::path::PathBuf> {
  let mut dirs = Vec::new();
  if let Some(home) = std::env::var_os("HOME") {
    let home = std::path::PathBuf::from(home);
    dirs.push(home.join(".fonts"));
    dirs.push(home.join(".local/share/fonts"));
    dirs.push(home.join("Library/Fonts"));
  }
  #[cfg(target_os = "macos")]
  {
    dirs.push("/System/Library/Fonts".into());
    dirs.push("/System/Library/Fonts/Supplemental".into());
    dirs.push("/Library/Fonts".into());
  }
  #[cfg(target_os = "windows")]
  {
    if let Some(windir) = std::env::var_os("WINDIR") {
      dirs.push(std::path::PathBuf::from(windir).join("Fonts"));
    }
  }
  #[cfg(not(any(target_os = "macos", target_os = "windows")))]
  {
    dirs.push("/usr/share/fonts".into());
    dirs.push("/usr/local/share/fonts".into());
  }
  dirs
}

#[tauri::command]
fn read_system_fonts(text: String) -> Option<Vec<PdfFontFile>> {
  read_system_fonts_from(&FONT_FAMILIES, &font_dirs(), &text)
}

fn read_system_fonts_from(
  families: &[FontFamily],
  dirs: &[std::path::PathBuf],
  text: &str,
) -> Option<Vec<PdfFontFile>> {
  let mut chars: Vec<char> = text.chars().collect();
  chars.sort_unstable();
  chars.dedup();
  let mut best: Option<(usize, usize)> = None;
  for (index, family) in families.iter().enumerate() {
    let Some(normal_path) = find_variant(dirs, family.normal) else {
      continue;
    };
    let Ok(normal_bytes) = std::fs::read(&normal_path) else {
      continue;
    };
    let covered = covered_count(&normal_bytes, &chars);
    if covered == chars.len() {
      return Some(read_family_files(dirs, family, &normal_path));
    }
    if best.map_or(true, |(count, _)| covered > count) {
      best = Some((covered, index));
    }
  }
  let (_, index) = best?;
  let family = &families[index];
  let normal_path = find_variant(dirs, family.normal)?;
  Some(read_family_files(dirs, family, &normal_path))
}

fn covered_count(font_bytes: &[u8], chars: &[char]) -> usize {
  let Ok(font) = fontdue::Font::from_bytes(font_bytes, fontdue::FontSettings::default()) else {
    return 0;
  };
  chars
    .iter()
    .filter(|c| font.lookup_glyph_index(**c) != 0)
    .count()
}

fn read_family_files(
  dirs: &[std::path::PathBuf],
  family: &FontFamily,
  normal_path: &std::path::Path,
) -> Vec<PdfFontFile> {
  use base64::Engine;
  let variants = [family.normal, family.bold, family.italics, family.bolditalics];
  let mut files = Vec::new();
  for (index, candidates) in variants.iter().enumerate() {
    let path = if index == 0 {
      normal_path.to_path_buf()
    } else {
      find_variant(dirs, candidates).unwrap_or_else(|| normal_path.to_path_buf())
    };
    let Ok(bytes) = std::fs::read(&path) else {
      continue;
    };
    files.push(PdfFontFile {
      role: FONT_ROLES[index].to_string(),
      base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    });
  }
  files
}

fn find_variant(dirs: &[std::path::PathBuf], candidates: &[&str]) -> Option<std::path::PathBuf> {
  for candidate in candidates {
    if let Some(path) = find_font(dirs, candidate) {
      return Some(path);
    }
  }
  None
}

fn find_font(dirs: &[std::path::PathBuf], filename: &str) -> Option<std::path::PathBuf> {
  let wanted = filename.to_lowercase();
  for dir in dirs {
    if let Some(found) = find_font_in_dir(dir, &wanted, 0) {
      return Some(found);
    }
  }
  None
}

fn find_font_in_dir(dir: &std::path::Path, wanted: &str, depth: u32) -> Option<std::path::PathBuf> {
  if depth > 5 {
    return None;
  }
  let entries = std::fs::read_dir(dir).ok()?;
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      if let Some(found) = find_font_in_dir(&path, wanted, depth + 1) {
        return Some(found);
      }
    } else if path
      .file_name()
      .and_then(|name| name.to_str())
      .is_some_and(|name| name.to_lowercase() == wanted)
    {
      return Some(path);
    }
  }
  None
}

#[cfg(test)]
mod tests {
  use super::*;

  static FAMILY_A: FontFamily = FontFamily {
    normal: &["font-a.ttf"],
    bold: &[],
    italics: &[],
    bolditalics: &[],
  };
  static FAMILY_B: FontFamily = FontFamily {
    normal: &["font-b.ttf"],
    bold: &[],
    italics: &[],
    bolditalics: &[],
  };

  #[test]
  fn selects_family_that_covers_all_chars() {
    let dir = std::env::temp_dir().join(format!("markify-font-test-a-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("font-a.ttf"), build_minimal_ttf(&[(0x20, 0x7e)])).unwrap();
    std::fs::write(
      dir.join("font-b.ttf"),
      build_minimal_ttf(&[(0x20, 0x7e), (0x24b6, 0x24e9)]),
    )
    .unwrap();
    let files = read_system_fonts_from(&[FAMILY_A, FAMILY_B], &[dir.clone()], "x \u{24BC}").unwrap();
    assert_eq!(files[0].role, "normal");
    assert_eq!(files[0].base64, base64_of(&build_minimal_ttf(&[(0x20, 0x7e), (0x24b6, 0x24e9)])));
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn falls_back_to_most_covering_family() {
    let dir = std::env::temp_dir().join(format!("markify-font-test-b-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("font-a.ttf"), build_minimal_ttf(&[(0x20, 0x7e)])).unwrap();
    let files = read_system_fonts_from(&[FAMILY_A, FAMILY_B], &[dir.clone()], "x \u{24BC}").unwrap();
    assert_eq!(files[0].base64, base64_of(&build_minimal_ttf(&[(0x20, 0x7e)])));
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn prefers_first_family_when_coverage_is_equal() {
    let dir = std::env::temp_dir().join(format!("markify-font-test-c-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("font-a.ttf"), build_minimal_ttf(&[(0x20, 0x7e)])).unwrap();
    std::fs::write(dir.join("font-b.ttf"), build_minimal_ttf(&[(0x20, 0x7e)])).unwrap();
    let files = read_system_fonts_from(&[FAMILY_A, FAMILY_B], &[dir.clone()], "hello").unwrap();
    assert_eq!(files[0].base64, base64_of(&build_minimal_ttf(&[(0x20, 0x7e)])));
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn reads_all_variants_and_falls_back_to_normal() {
    let dir = std::env::temp_dir().join(format!("markify-font-test-d-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let normal = build_minimal_ttf(&[(0x20, 0x7e)]);
    let bold = build_minimal_ttf(&[(0x20, 0x7e)]);
    std::fs::write(dir.join("font-a.ttf"), &normal).unwrap();
    std::fs::write(dir.join("font-a-bold.ttf"), &bold).unwrap();
    let family = FontFamily {
      normal: &["font-a.ttf"],
      bold: &["font-a-bold.ttf"],
      italics: &[],
      bolditalics: &[],
    };
    let files = read_system_fonts_from(&[family], &[dir.clone()], "hello").unwrap();
    let roles: Vec<&str> = files.iter().map(|file| file.role.as_str()).collect();
    assert_eq!(roles, ["normal", "bold", "italics", "bolditalics"]);
    assert_eq!(files[0].base64, base64_of(&normal));
    assert_eq!(files[1].base64, base64_of(&bold));
    assert_eq!(files[2].base64, base64_of(&normal));
    assert_eq!(files[3].base64, base64_of(&normal));
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn falls_back_to_next_family_when_missing() {
    let dir = std::env::temp_dir().join(format!("markify-font-test-e-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("font-b.ttf"), build_minimal_ttf(&[(0x20, 0x7e)])).unwrap();
    let files = read_system_fonts_from(&[FAMILY_A, FAMILY_B], &[dir.clone()], "hello").unwrap();
    assert_eq!(files[0].base64, base64_of(&build_minimal_ttf(&[(0x20, 0x7e)])));
    std::fs::remove_dir_all(dir).unwrap();
  }

  fn base64_of(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
  }

  fn build_minimal_ttf(segments: &[(u16, u16)]) -> Vec<u8> {
    let cmap = build_cmap(segments);
    let head = build_head();
    let hhea = build_hhea();
    let mut hmtx = Vec::new();
    push_u16(&mut hmtx, 1000);
    push_i16(&mut hmtx, 0);
    let maxp = {
      let mut bytes = Vec::new();
      push_u32(&mut bytes, 0x00010000);
      push_u16(&mut bytes, 0xffff);
      bytes
    };
    let tables: [(&[u8], &[u8]); 5] = [
      (b"cmap", &cmap),
      (b"head", &head),
      (b"hhea", &hhea),
      (b"hmtx", &hmtx),
      (b"maxp", &maxp),
    ];
    let header_size = 12 + tables.len() * 16;
    let mut offset = header_size;
    let mut records: Vec<Vec<u8>> = Vec::new();
    for (tag, data) in tables {
      let mut record = Vec::new();
      record.extend_from_slice(tag);
      record.extend_from_slice(&[0, 0, 0, 0]);
      push_u32(&mut record, offset as u32);
      push_u32(&mut record, data.len() as u32);
      records.push(record);
      offset += data.len();
    }
    let mut result = Vec::new();
    push_u32(&mut result, 0x00010000);
    push_u16(&mut result, tables.len() as u16);
    push_u16(&mut result, 16);
    push_u16(&mut result, 1);
    push_u16(&mut result, 0);
    for record in records {
      result.extend_from_slice(&record);
    }
    for (_, data) in tables {
      result.extend_from_slice(data);
    }
    result
  }

  fn build_cmap(segments: &[(u16, u16)]) -> Vec<u8> {
    let seg_count = segments.len() as u16;
    let mut subtable = Vec::new();
    push_u16(&mut subtable, 4);
    push_u16(&mut subtable, 16 + 8 * seg_count);
    push_u16(&mut subtable, 0);
    push_u16(&mut subtable, seg_count * 2);
    let search_range = 2u16.pow(seg_count.ilog2()) * 2;
    push_u16(&mut subtable, search_range);
    push_u16(&mut subtable, seg_count.ilog2() as u16);
    push_u16(&mut subtable, seg_count * 2 - search_range);
    for (_, end) in segments {
      push_u16(&mut subtable, *end);
    }
    push_u16(&mut subtable, 0);
    for (start, _) in segments {
      push_u16(&mut subtable, *start);
    }
    for _ in segments {
      push_u16(&mut subtable, 0);
    }
    for _ in segments {
      push_u16(&mut subtable, 0);
    }
    let mut cmap = Vec::new();
    push_u16(&mut cmap, 0);
    push_u16(&mut cmap, 1);
    push_u16(&mut cmap, 3);
    push_u16(&mut cmap, 1);
    push_u32(&mut cmap, 12);
    cmap.extend_from_slice(&subtable);
    cmap
  }

  fn build_head() -> Vec<u8> {
    let mut bytes = Vec::new();
    push_u32(&mut bytes, 0x00010000);
    push_u32(&mut bytes, 0x00010000);
    push_u32(&mut bytes, 0);
    push_u32(&mut bytes, 0x5f0f3cf5);
    push_u16(&mut bytes, 0);
    push_u16(&mut bytes, 1000);
    push_u64(&mut bytes, 0);
    push_u64(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    push_u16(&mut bytes, 0);
    push_u16(&mut bytes, 8);
    push_i16(&mut bytes, 2);
    push_i16(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    bytes
  }

  fn build_hhea() -> Vec<u8> {
    let mut bytes = Vec::new();
    push_u32(&mut bytes, 0x00010000);
    push_i16(&mut bytes, 800);
    push_i16(&mut bytes, -200);
    push_i16(&mut bytes, 0);
    push_u16(&mut bytes, 1000);
    push_i16(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    push_i16(&mut bytes, 1);
    push_i16(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    push_u32(&mut bytes, 0);
    push_u16(&mut bytes, 0);
    push_u16(&mut bytes, 0);
    push_i16(&mut bytes, 0);
    push_u16(&mut bytes, 1);
    bytes
  }

  fn push_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_be_bytes());
  }

  fn push_i16(bytes: &mut Vec<u8>, value: i16) {
    bytes.extend_from_slice(&value.to_be_bytes());
  }

  fn push_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_be_bytes());
  }

  fn push_u64(bytes: &mut Vec<u8>, value: u64) {
    bytes.extend_from_slice(&value.to_be_bytes());
  }
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
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      read_markdown_file,
      write_markdown_file,
      write_pdf_file,
      read_image_base64,
      read_system_fonts
    ])
    .setup(|app| {
      #[cfg(any(target_os = "linux", target_os = "windows"))]
      disable_pinch_zoom(app);
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

// On Linux, the pinch-to-zoom gesture is handled natively by WebKitGTK (it
// never reaches the web content, so CSS/JS cannot block it). WebKit stores
// its internal zoom gesture (a GtkGestureZoom) on the WebView widget under
// the "wk-view-zoom-gesture" qdata; destroying its signal handlers disables
// the gesture. See WebKitWebViewBase.cpp in the WebKit source.
#[cfg(target_os = "linux")]
fn disable_pinch_zoom(app: &tauri::App) {
  use tauri::Manager;

  let Some(window) = app.get_webview_window("main") else {
    return;
  };
  window
    .with_webview(|webview| {
      use gtk::glib::prelude::*;
      unsafe {
        if let Some(gesture) = webview.inner().data::<gobject_sys::GObject>("wk-view-zoom-gesture") {
          gobject_sys::g_signal_handlers_destroy(gesture.as_ptr());
        }
      }
    })
    .expect("failed to disable pinch zoom");
}

// On Windows, pinch-to-zoom is handled natively by WebView2 (Chromium) and
// does not always reach the web content. Disable it through the WebView2
// settings, falling back to the web-side guards (CSS/JS) if the runtime is
// too old to expose ICoreWebView2Settings5.
#[cfg(target_os = "windows")]
fn disable_pinch_zoom(app: &tauri::App) {
  use tauri::Manager;
  use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings5;

  let Some(window) = app.get_webview_window("main") else {
    return;
  };
  window
    .with_webview(|webview| unsafe {
      if let Ok(core) = webview.controller().CoreWebView2() {
        if let Ok(settings) = core.Settings() {
          if let Ok(settings5) = settings.cast::<ICoreWebView2Settings5>() {
            let _ = settings5.SetIsPinchZoomEnabled(false);
          }
        }
      }
    })
    .expect("failed to disable pinch zoom");
}
