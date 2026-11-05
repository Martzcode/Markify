use std::collections::BTreeSet;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};
use notify::Watcher;
use tauri::{AppHandle, Emitter, State};

/// Délai de regroupement des événements du système de fichiers. Les éditeurs
/// produisent souvent plusieurs notifications pour une seule sauvegarde.
const FS_DEBOUNCE: Duration = Duration::from_millis(300);

/// Durée maximale d'un lot : évite de différer indéfiniment les événements
/// lorsqu'un dossier est modifié en continu.
const FS_MAX_BATCH: Duration = Duration::from_secs(1);

#[tauri::command]
fn read_markdown_file(path: String) -> Result<String, String> {
  std::fs::read_to_string(&path).map_err(|err| err.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
  name: String,
  path: String,
  is_dir: bool,
  children: Vec<DirEntry>,
}

fn is_readable_markdown(name: &str) -> bool {
  let lower = name.to_lowercase();
  lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".mdx")
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
  let read_dir = std::fs::read_dir(&path).map_err(|err| err.to_string())?;
  let mut entries: Vec<DirEntry> = Vec::new();
  for entry in read_dir.flatten() {
    let Ok(file_type) = entry.file_type() else {
      continue;
    };
    let name = entry.file_name().to_string_lossy().into_owned();
    if !file_type.is_dir() && !is_readable_markdown(&name) {
      continue;
    }
    let entry_path = entry.path().to_string_lossy().into_owned();
    entries.push(DirEntry {
      name,
      path: entry_path,
      is_dir: file_type.is_dir(),
      children: Vec::new(),
    });
  }
  entries.sort_by(|a, b| {
    b.is_dir
      .cmp(&a.is_dir)
      .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
  });
  Ok(entries)
}

/// Vérifie qu'un nom saisi par l'utilisateur ne peut pas sortir du dossier
/// courant ni écraser une entrée existante par un chemin relatif.
fn validate_entry_name(name: &str) -> Result<String, String> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err("Le nom ne peut pas être vide".to_string());
  }
  if trimmed == "." || trimmed == ".." {
    return Err("Ce nom n'est pas autorisé".to_string());
  }
  if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
    return Err("Le nom ne peut pas contenir de séparateur de dossier".to_string());
  }
  Ok(trimmed.to_string())
}

fn entry_path(parent: &str, name: &str) -> Result<std::path::PathBuf, String> {
  let name = validate_entry_name(name)?;
  Ok(std::path::Path::new(parent).join(name))
}

/// Crée un fichier Markdown vide ou un dossier dans `parent`.
#[tauri::command]
fn create_entry(parent: String, name: String, is_dir: bool) -> Result<String, String> {
  let path = entry_path(&parent, &name)?;
  if path.exists() {
    return Err("Une entrée de ce nom existe déjà".to_string());
  }
  if is_dir {
    std::fs::create_dir(&path).map_err(|err| err.to_string())?;
  } else {
    std::fs::File::create(&path).map_err(|err| err.to_string())?;
  }
  Ok(path.to_string_lossy().into_owned())
}

/// Renomme une entrée sans la déplacer dans un autre dossier.
#[tauri::command]
fn rename_entry(path: String, new_name: String) -> Result<String, String> {
  let source = std::path::PathBuf::from(&path);
  if !source.exists() {
    return Err("L'entrée est introuvable".to_string());
  }
  let parent = source
    .parent()
    .ok_or_else(|| "L'entrée n'a pas de dossier parent".to_string())?;
  let target = entry_path(&parent.to_string_lossy(), &new_name)?;
  if target == source {
    return Ok(path);
  }
  if target.exists() {
    return Err("Une entrée de ce nom existe déjà".to_string());
  }
  std::fs::rename(&source, &target).map_err(|err| err.to_string())?;
  Ok(target.to_string_lossy().into_owned())
}

fn sanitize_copy_suffix(suffix: &str) -> String {
  let cleaned: String = suffix
    .trim()
    .chars()
    .map(|character| {
      if character.is_alphanumeric() || character == '-' || character == '_' {
        character
      } else {
        '-'
      }
    })
    .collect();
  if cleaned.is_empty() {
    "copy".to_string()
  } else {
    cleaned
  }
}

/// Construit un chemin libre : `note-copie.md`, puis `note-copie-1.md`.
fn unique_path(
  parent: &std::path::Path,
  stem: &str,
  extension: Option<&str>,
) -> std::path::PathBuf {
  let compose = |index: usize| {
    let candidate = match extension {
      Some(extension) if !extension.is_empty() => format!("{stem}.{extension}"),
      _ => stem.to_string(),
    };
    let candidate = if index == 0 {
      candidate
    } else {
      match extension {
        Some(extension) if !extension.is_empty() => format!("{stem}-{index}.{extension}"),
        _ => format!("{stem}-{index}"),
      }
    };
    parent.join(candidate)
  };
  let mut index = 0;
  loop {
    let candidate = compose(index);
    if !candidate.exists() {
      return candidate;
    }
    index += 1;
  }
}

fn copy_dir_all(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
  std::fs::create_dir(target).map_err(|err| err.to_string())?;
  for entry in std::fs::read_dir(source).map_err(|err| err.to_string())? {
    let entry = entry.map_err(|err| err.to_string())?;
    let file_type = entry.file_type().map_err(|err| err.to_string())?;
    let destination = target.join(entry.file_name());
    if file_type.is_dir() {
      copy_dir_all(&entry.path(), &destination)?;
    } else if file_type.is_file() {
      std::fs::copy(entry.path(), &destination).map_err(|err| err.to_string())?;
    }
  }
  Ok(())
}

/// Duplique un fichier ou un dossier à côté de l'original, sans écraser.
#[tauri::command]
fn duplicate_entry(path: String, suffix: String) -> Result<String, String> {
  let source = std::path::PathBuf::from(&path);
  if !source.exists() {
    return Err("L'entrée est introuvable".to_string());
  }
  let parent = source
    .parent()
    .ok_or_else(|| "L'entrée n'a pas de dossier parent".to_string())?;
  let stem = source
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("copy");
  let extension = source.extension().and_then(|value| value.to_str());
  let suffix = sanitize_copy_suffix(&suffix);
  let target = unique_path(parent, &format!("{stem}-{suffix}"), extension);
  if source.is_dir() {
    copy_dir_all(&source, &target)?;
  } else {
    std::fs::copy(&source, &target).map_err(|err| err.to_string())?;
  }
  Ok(target.to_string_lossy().into_owned())
}

/// Envoie un fichier ou un dossier à la corbeille du système d'exploitation.
#[tauri::command]
fn delete_entry(path: String) -> Result<(), String> {
  let target = std::path::PathBuf::from(&path);
  if !target.exists() {
    return Err("L'entrée est introuvable".to_string());
  }
  trash::delete(&target).map_err(|err| err.to_string())
}

fn move_path(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
  if std::fs::rename(source, target).is_ok() {
    return Ok(());
  }
  // Renommage impossible (par exemple entre deux volumes) : copie puis
  // suppression de la source.
  if source.is_dir() {
    copy_dir_all(source, target)?;
    std::fs::remove_dir_all(source).map_err(|err| err.to_string())?;
  } else {
    std::fs::copy(source, target).map_err(|err| err.to_string())?;
    std::fs::remove_file(source).map_err(|err| err.to_string())?;
  }
  Ok(())
}

/// Déplace une entrée dans un dossier (glisser-déposer de l'explorateur).
#[tauri::command]
fn move_entry(path: String, target_dir: String) -> Result<String, String> {
  let source = std::path::PathBuf::from(&path);
  if !source.exists() {
    return Err("L'entrée est introuvable".to_string());
  }
  let target_dir = std::path::PathBuf::from(&target_dir);
  if !target_dir.is_dir() {
    return Err("La destination n'est pas un dossier".to_string());
  }
  let name = source
    .file_name()
    .ok_or_else(|| "L'entrée n'a pas de nom".to_string())?;
  let target = target_dir.join(name);

  let canonical_source = std::fs::canonicalize(&source).map_err(|err| err.to_string())?;
  let canonical_target_dir =
    std::fs::canonicalize(&target_dir).map_err(|err| err.to_string())?;
  if canonical_target_dir == canonical_source
    || (source.is_dir() && canonical_target_dir.starts_with(&canonical_source))
  {
    return Err("Impossible de déplacer un dossier dans lui-même".to_string());
  }
  if source.parent().is_some_and(|parent| {
    std::fs::canonicalize(parent).is_ok_and(|parent| parent == canonical_target_dir)
  }) {
    return Ok(path);
  }
  if target.exists() {
    return Err("Une entrée de ce nom existe déjà dans le dossier".to_string());
  }

  move_path(&source, &target)?;
  Ok(target.to_string_lossy().into_owned())
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
fn read_image_base64(path: String, base_dir: Option<String>) -> Result<String, String> {
  use base64::Engine;
  // Une image locale n'est lue que si elle se trouve dans le dossier du
  // document : un fichier Markdown non fiable ne peut donc pas exfiltrer un
  // fichier arbitraire (clé SSH, etc.) dans le PDF exporté.
  let base_dir = base_dir.ok_or_else(|| {
    "Les images locales ne sont lues que depuis le dossier d'un document enregistré".to_string()
  })?;
  let base = std::fs::canonicalize(&base_dir).map_err(|err| err.to_string())?;
  let file = std::fs::canonicalize(&path).map_err(|err| err.to_string())?;
  if !file.starts_with(&base) {
    return Err("Image en dehors du dossier du document".to_string());
  }
  let bytes = std::fs::read(&file).map_err(|err| err.to_string())?;
  Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

const IMAGE_EXTENSIONS: [&str; 9] = [
  "avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp",
];

fn is_image_file_name(name: &str) -> bool {
  std::path::Path::new(name)
    .extension()
    .and_then(|extension| extension.to_str())
    .is_some_and(|extension| {
      IMAGE_EXTENSIONS
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
    })
}

/// Réduit un nom de fichier à des caractères sûrs et garantit une extension
/// d'image connue. Le nom ne contient jamais de séparateur de dossier.
fn sanitize_image_file_name(name: &str) -> String {
  let base = name
    .rsplit(|character| character == '/' || character == '\\')
    .next()
    .unwrap_or(name);
  let mut cleaned: String = base
    .chars()
    .map(|character| {
      if character.is_ascii_alphanumeric() || character == '-' || character == '_' || character == '.'
      {
        character
      } else {
        '-'
      }
    })
    .collect();
  cleaned = cleaned.trim_matches('.').to_string();
  if cleaned.is_empty() {
    cleaned.push_str("image");
  }
  if !is_image_file_name(&cleaned) {
    cleaned.push_str(".png");
  }
  cleaned
}

/// Ajoute un suffixe numérique plutôt que d'écraser une image existante.
fn unique_image_path(directory: &std::path::Path, name: &str) -> std::path::PathBuf {
  let candidate = directory.join(name);
  if !candidate.exists() {
    return candidate;
  }
  let path = std::path::Path::new(name);
  let stem = path
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("image");
  let extension = path
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or("png");
  let mut index = 1;
  loop {
    let candidate = directory.join(format!("{stem}-{index}.{extension}"));
    if !candidate.exists() {
      return candidate;
    }
    index += 1;
  }
}

fn save_image_bytes(
  document_path: &str,
  file_name: &str,
  bytes: &[u8],
) -> Result<String, String> {
  if bytes.is_empty() {
    return Err("L'image est vide".to_string());
  }
  let document = std::path::Path::new(document_path);
  let directory = document
    .parent()
    .filter(|directory| !directory.as_os_str().is_empty())
    .ok_or_else(|| "Le document n'a pas de dossier".to_string())?;
  let assets = directory.join("assets");
  std::fs::create_dir_all(&assets).map_err(|err| err.to_string())?;
  let name = sanitize_image_file_name(file_name);
  let path = unique_image_path(&assets, &name);
  std::fs::write(&path, bytes).map_err(|err| err.to_string())?;
  let written = path
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or(&name);
  Ok(format!("./assets/{written}"))
}

/// Enregistre une image fournie en base64 (presse-papiers) dans `./assets`.
#[tauri::command]
fn save_image(document_path: String, file_name: String, data: String) -> Result<String, String> {
  use base64::Engine;
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(data.as_bytes())
    .map_err(|err| err.to_string())?;
  save_image_bytes(&document_path, &file_name, &bytes)
}

/// Copie un fichier image existant (glisser-déposer, sélecteur) dans `./assets`.
#[tauri::command]
fn save_image_from_path(document_path: String, source_path: String) -> Result<String, String> {
  let source = std::path::Path::new(&source_path);
  let name = source
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or("image.png");
  if !is_image_file_name(name) {
    return Err("Le fichier sélectionné n'est pas une image".to_string());
  }
  let bytes = std::fs::read(source).map_err(|err| err.to_string())?;
  save_image_bytes(&document_path, name, &bytes)
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

/// Charge utile de l'événement `fs-changed` envoyé au frontend.
#[derive(Clone, serde::Serialize)]
struct FsChangedPayload {
  paths: Vec<String>,
}

/// État partagé du surveillant de fichiers. Un seul watcher est actif : il est
/// recréé lorsque la liste des dossiers utiles change.
#[derive(Default)]
struct WatchState {
  inner: std::sync::Mutex<Option<WatchHandle>>,
  requested: std::sync::Mutex<Vec<String>>,
}

struct WatchHandle {
  _watcher: notify::RecommendedWatcher,
}

/// Dossiers et fichiers temporaires ignorés : ils génèrent du bruit sans
/// intérêt pour l'éditeur et ne doivent jamais déclencher de rechargement.
fn is_ignored_path(path: &std::path::Path) -> bool {
  const IGNORED_DIRS: [&str; 8] = [
    ".git",
    "node_modules",
    "target",
    "dist",
    ".angular",
    ".idea",
    ".vscode",
    "__pycache__",
  ];

  for component in path.components() {
    if let std::path::Component::Normal(name) = component {
      let name = name.to_string_lossy();
      if IGNORED_DIRS
        .iter()
        .any(|ignored| name.eq_ignore_ascii_case(ignored))
      {
        return true;
      }
      if name.ends_with(".swp") || name.ends_with(".swx") || name.ends_with('~') {
        return true;
      }
    }
  }

  let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
    return false;
  };
  name == ".DS_Store" || name.ends_with(".tmp") || name.ends_with(".temp")
}

/// Normalise, déduplique et trie les dossiers à surveiller. Les séparateurs
/// sont uniformisés pour que deux écritures du même chemin ne recréent pas le
/// watcher inutilement.
fn normalized_watch_paths(paths: &[String]) -> Vec<String> {
  let mut wanted = BTreeSet::new();
  for path in paths {
    if path.trim().is_empty() {
      continue;
    }
    let mut trimmed = path.trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
      // Racine du système de fichiers (`/`) : on la conserve telle quelle.
      if path.starts_with('/') {
        trimmed = "/";
      } else {
        continue;
      }
    }
    let normalized = trimmed.replace('\\', "/");
    // Une racine de lecteur (`C:`) doit conserver son séparateur.
    let normalized = if normalized.len() == 2 && normalized.ends_with(':') {
      format!("{normalized}/")
    } else {
      normalized
    };
    wanted.insert(normalized);
  }
  wanted.into_iter().collect()
}

/// Regroupe les notifications reçues pendant `FS_DEBOUNCE` avant d'émettre un
/// seul événement vers le frontend. Le thread s'arrête quand le canal est
/// déconnecté, c'est-à-dire quand l'ancien watcher est remplacé.
fn debounce_events(app: AppHandle, receiver: Receiver<String>) {
  let mut pending = BTreeSet::new();
  loop {
    let first = match receiver.recv() {
      Ok(path) => path,
      Err(_) => return,
    };
    pending.insert(first);

    let deadline = Instant::now() + FS_MAX_BATCH;
    loop {
      let remaining = deadline.saturating_duration_since(Instant::now());
      if remaining.is_zero() {
        break;
      }
      match receiver.recv_timeout(remaining.min(FS_DEBOUNCE)) {
        Ok(path) => {
          pending.insert(path);
        }
        Err(RecvTimeoutError::Timeout) => break,
        Err(RecvTimeoutError::Disconnected) => {
          emit_changes(&app, &mut pending);
          return;
        }
      }
    }
    emit_changes(&app, &mut pending);
  }
}

fn emit_changes(app: &AppHandle, pending: &mut BTreeSet<String>) {
  if pending.is_empty() {
    return;
  }
  let paths: Vec<String> = std::mem::take(pending).into_iter().collect();
  let _ = app.emit("fs-changed", FsChangedPayload { paths });
}

/// Met en place la surveillance non récursive des dossiers demandés. Le
/// frontend n'envoie que la racine ouverte, les dossiers dépliés et les
/// parents des onglets, ce qui garde le nombre de handles très faible.
#[tauri::command]
fn set_watched_paths(
  app: AppHandle,
  state: State<'_, WatchState>,
  paths: Vec<String>,
) -> Result<(), String> {
  let wanted = normalized_watch_paths(&paths);
  {
    let requested = state
      .requested
      .lock()
      .map_err(|_| "état de surveillance indisponible")?;
    if *requested == wanted {
      return Ok(());
    }
  }

  let mut inner = state
    .inner
    .lock()
    .map_err(|_| "état de surveillance indisponible")?;
  // Remplace l'ancien watcher : le thread de regroupement s'arrête quand son
  // canal est déconnecté.
  *inner = None;

  if wanted.is_empty() {
    *state
      .requested
      .lock()
      .map_err(|_| "état de surveillance indisponible")? = wanted;
    return Ok(());
  }

  let (sender, receiver) = std::sync::mpsc::channel::<String>();
  let debounce_app = app.clone();
  std::thread::Builder::new()
    .name("markify-fs-debounce".into())
    .spawn(move || debounce_events(debounce_app, receiver))
    .map_err(|err| err.to_string())?;

  let mut watcher = notify::recommended_watcher(
    move |result: notify::Result<notify::Event>| {
      if let Ok(event) = result {
        for path in event.paths {
          if !is_ignored_path(&path) {
            let _ = sender.send(path.to_string_lossy().into_owned());
          }
        }
      }
    },
  )
  .map_err(|err| err.to_string())?;

  for path in &wanted {
    // Un dossier supprimé entre-temps ne doit pas faire échouer la mise à jour.
    let _ = watcher.watch(
      std::path::Path::new(path),
      notify::RecursiveMode::NonRecursive,
    );
  }

  *inner = Some(WatchHandle { _watcher: watcher });
  *state
    .requested
    .lock()
    .map_err(|_| "état de surveillance indisponible")? = wanted;
  Ok(())
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

  #[test]
  fn lists_directories_first_then_files_alphabetically() {
    let dir = std::env::temp_dir().join(format!("markify-dir-test-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("b-folder")).unwrap();
    std::fs::create_dir_all(dir.join("a-folder")).unwrap();
    std::fs::write(dir.join("zebra.md"), "z").unwrap();
    std::fs::write(dir.join("Apple.md"), "a").unwrap();
    std::fs::write(dir.join("a-folder").join("nested.md"), "n").unwrap();

    let entries = list_directory(dir.to_string_lossy().into_owned()).unwrap();

    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
    assert_eq!(names, ["a-folder", "b-folder", "Apple.md", "zebra.md"]);
    assert!(entries[0].is_dir);
    assert!(entries[2].is_dir == false);
    assert_eq!(entries[0].children.len(), 0);
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn filters_out_files_the_app_cannot_read() {
    let dir = std::env::temp_dir().join(format!("markify-dir-filter-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("docs")).unwrap();
    std::fs::write(dir.join("notes.txt"), "not md").unwrap();
    std::fs::write(dir.join("readme.md"), "md").unwrap();
    std::fs::write(dir.join("report.MD"), "upper").unwrap();
    std::fs::write(dir.join("slides.mdx"), "mdx").unwrap();
    std::fs::write(dir.join("draft.markdown"), "markdown").unwrap();
    std::fs::write(dir.join("noext"), "noext").unwrap();

    let entries = list_directory(dir.to_string_lossy().into_owned()).unwrap();

    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
    assert_eq!(names, ["docs", "draft.markdown", "readme.md", "report.MD", "slides.mdx"]);
    assert!(entries.iter().all(|e| e.is_dir || e.name.to_lowercase().ends_with(".md")
      || e.name.to_lowercase().ends_with(".markdown")
      || e.name.to_lowercase().ends_with(".mdx")));
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn reads_an_image_inside_the_document_dir() {
    let dir = std::env::temp_dir().join(format!("markify-image-in-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("img.bin");
    std::fs::write(&file, b"abc").unwrap();

    let encoded = read_image_base64(
      file.to_string_lossy().into_owned(),
      Some(dir.to_string_lossy().into_owned()),
    )
    .unwrap();

    assert_eq!(encoded, "YWJj");
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn rejects_an_image_outside_the_document_dir() {
    let root = std::env::temp_dir().join(format!("markify-image-out-{}", std::process::id()));
    let base = root.join("doc");
    std::fs::create_dir_all(&base).unwrap();
    let secret = root.join("secret.txt");
    std::fs::write(&secret, b"secret").unwrap();

    let error = read_image_base64(
      secret.to_string_lossy().into_owned(),
      Some(base.to_string_lossy().into_owned()),
    )
    .unwrap_err();

    assert!(error.contains("hors du dossier"));
    std::fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn rejects_a_local_image_without_a_document_dir() {
    let dir = std::env::temp_dir().join(format!("markify-image-none-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("img.bin");
    std::fs::write(&file, b"abc").unwrap();

    assert!(read_image_base64(file.to_string_lossy().into_owned(), None).is_err());
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn saves_an_image_next_to_the_document() {
    let dir = std::env::temp_dir().join(format!("markify-image-save-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let document = dir.join("note.md");

    let link = save_image_bytes(&document.to_string_lossy(), "photo.png", b"png").unwrap();

    assert_eq!(link, "./assets/photo.png");
    assert_eq!(std::fs::read(dir.join("assets/photo.png")).unwrap(), b"png");
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn saves_a_base64_clipboard_image() {
    let dir = std::env::temp_dir().join(format!("markify-image-b64-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let document = dir.join("note.md");

    let link = save_image(
      document.to_string_lossy().into_owned(),
      "clip.png".to_string(),
      base64_of(b"clip"),
    )
    .unwrap();

    assert_eq!(link, "./assets/clip.png");
    assert_eq!(std::fs::read(dir.join("assets/clip.png")).unwrap(), b"clip");
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn sanitizes_image_names_and_blocks_traversal() {
    let root = std::env::temp_dir().join(format!("markify-image-safe-{}", std::process::id()));
    let dir = root.join("doc");
    std::fs::create_dir_all(&dir).unwrap();
    let document = dir.join("note.md");

    let link = save_image_bytes(&document.to_string_lossy(), "../../evil.png", b"x").unwrap();

    assert_eq!(link, "./assets/evil.png");
    assert!(!root.join("evil.png").exists());
    assert!(dir.join("assets/evil.png").exists());
    std::fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn replaces_unsafe_characters_in_image_names() {
    let dir = std::env::temp_dir().join(format!("markify-image-chars-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let document = dir.join("note.md");

    let link = save_image_bytes(&document.to_string_lossy(), "my photo (1).png", b"x").unwrap();

    assert_eq!(link, "./assets/my-photo--1-.png");
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn avoids_overwriting_an_existing_image() {
    let dir = std::env::temp_dir().join(format!("markify-image-uniq-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let document = dir.join("note.md");

    let first = save_image_bytes(&document.to_string_lossy(), "photo.png", b"one").unwrap();
    let second = save_image_bytes(&document.to_string_lossy(), "photo.png", b"two").unwrap();

    assert_eq!(first, "./assets/photo.png");
    assert_eq!(second, "./assets/photo-1.png");
    assert_eq!(std::fs::read(dir.join("assets/photo.png")).unwrap(), b"one");
    assert_eq!(std::fs::read(dir.join("assets/photo-1.png")).unwrap(), b"two");
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn copies_a_dropped_image_file() {
    let root = std::env::temp_dir().join(format!("markify-image-drop-{}", std::process::id()));
    let dir = root.join("doc");
    std::fs::create_dir_all(&dir).unwrap();
    let source = root.join("screenshot.png");
    std::fs::write(&source, b"dropped").unwrap();
    let document = dir.join("note.md");

    let link = save_image_from_path(
      document.to_string_lossy().into_owned(),
      source.to_string_lossy().into_owned(),
    )
    .unwrap();

    assert_eq!(link, "./assets/screenshot.png");
    assert_eq!(std::fs::read(dir.join("assets/screenshot.png")).unwrap(), b"dropped");
    std::fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn rejects_a_dropped_file_that_is_not_an_image() {
    let root = std::env::temp_dir().join(format!("markify-image-bad-{}", std::process::id()));
    let dir = root.join("doc");
    std::fs::create_dir_all(&dir).unwrap();
    let source = root.join("notes.txt");
    std::fs::write(&source, b"text").unwrap();
    let document = dir.join("note.md");

    let error = save_image_from_path(
      document.to_string_lossy().into_owned(),
      source.to_string_lossy().into_owned(),
    )
    .unwrap_err();

    assert!(error.contains("pas une image"));
    std::fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn creates_files_and_folders_in_a_parent() {
    let dir = std::env::temp_dir().join(format!("markify-create-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    let file = create_entry(
      dir.to_string_lossy().into_owned(),
      "note.md".to_string(),
      false,
    )
    .unwrap();
    let folder = create_entry(
      dir.to_string_lossy().into_owned(),
      "docs".to_string(),
      true,
    )
    .unwrap();

    assert_eq!(std::fs::read_to_string(&file).unwrap(), "");
    assert!(std::path::Path::new(&folder).is_dir());
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn refuses_to_create_an_existing_entry() {
    let dir = std::env::temp_dir().join(format!("markify-create-exists-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("note.md"), "hello").unwrap();

    let error = create_entry(
      dir.to_string_lossy().into_owned(),
      "note.md".to_string(),
      false,
    )
    .unwrap_err();

    assert!(error.contains("existe déjà"));
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn rejects_names_with_path_separators() {
    let dir = std::env::temp_dir().join(format!("markify-create-safe-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    for name in ["../evil.md", "sub/evil.md", "sub\\evil.md", "..", "  "] {
      assert!(create_entry(dir.to_string_lossy().into_owned(), name.to_string(), false).is_err());
    }
    assert!(!dir.join("evil.md").exists());
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn renames_an_entry_in_the_same_folder() {
    let dir = std::env::temp_dir().join(format!("markify-rename-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let source = dir.join("before.md");
    std::fs::write(&source, "content").unwrap();

    let renamed = rename_entry(
      source.to_string_lossy().into_owned(),
      "after.md".to_string(),
    )
    .unwrap();

    assert_eq!(
      std::path::Path::new(&renamed),
      dir.join("after.md"),
    );
    assert!(!source.exists());
    assert_eq!(std::fs::read_to_string(dir.join("after.md")).unwrap(), "content");
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn refuses_to_rename_onto_an_existing_entry() {
    let dir = std::env::temp_dir().join(format!("markify-rename-busy-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let source = dir.join("a.md");
    std::fs::write(&source, "a").unwrap();
    std::fs::write(dir.join("b.md"), "b").unwrap();

    let error = rename_entry(source.to_string_lossy().into_owned(), "b.md".to_string()).unwrap_err();

    assert!(error.contains("existe déjà"));
    assert_eq!(std::fs::read_to_string(dir.join("b.md")).unwrap(), "b");
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn duplicates_a_file_without_overwriting() {
    let dir = std::env::temp_dir().join(format!("markify-duplicate-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let source = dir.join("note.md");
    std::fs::write(&source, "one").unwrap();

    let first = duplicate_entry(source.to_string_lossy().into_owned(), "copie".to_string()).unwrap();
    let second =
      duplicate_entry(source.to_string_lossy().into_owned(), "copie".to_string()).unwrap();

    assert!(first.ends_with("note-copie.md"));
    assert!(second.ends_with("note-copie-1.md"));
    assert_eq!(std::fs::read_to_string(&first).unwrap(), "one");
    assert_eq!(std::fs::read_to_string(&source).unwrap(), "one");
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn duplicates_a_folder_recursively() {
    let dir = std::env::temp_dir().join(format!("markify-duplicate-dir-{}", std::process::id()));
    let source = dir.join("docs");
    std::fs::create_dir_all(source.join("nested")).unwrap();
    std::fs::write(source.join("nested").join("note.md"), "hello").unwrap();

    let copy = duplicate_entry(source.to_string_lossy().into_owned(), "copy".to_string()).unwrap();

    assert!(copy.ends_with("docs-copy"));
    assert_eq!(
      std::fs::read_to_string(std::path::Path::new(&copy).join("nested").join("note.md")).unwrap(),
      "hello"
    );
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn moves_an_entry_into_a_folder() {
    let dir = std::env::temp_dir().join(format!("markify-move-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("target")).unwrap();
    let source = dir.join("note.md");
    std::fs::write(&source, "hello").unwrap();

    let moved = move_entry(
      source.to_string_lossy().into_owned(),
      dir.join("target").to_string_lossy().into_owned(),
    )
    .unwrap();

    assert_eq!(std::path::Path::new(&moved), dir.join("target").join("note.md"));
    assert!(!source.exists());
    assert_eq!(
      std::fs::read_to_string(dir.join("target").join("note.md")).unwrap(),
      "hello"
    );
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn refuses_to_move_a_folder_inside_itself() {
    let dir = std::env::temp_dir().join(format!("markify-move-self-{}", std::process::id()));
    let source = dir.join("docs");
    std::fs::create_dir_all(source.join("nested")).unwrap();

    let error = move_entry(
      source.to_string_lossy().into_owned(),
      source.join("nested").to_string_lossy().into_owned(),
    )
    .unwrap_err();

    assert!(error.contains("lui-même"));
    std::fs::remove_dir_all(dir).unwrap();
  }

  #[test]
  fn reports_a_missing_entry_on_delete_without_touching_the_trash() {
    let dir = std::env::temp_dir().join(format!("markify-delete-missing-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    let error = delete_entry(dir.join("missing.md").to_string_lossy().into_owned()).unwrap_err();

    assert!(error.contains("introuvable"));
    std::fs::remove_dir_all(dir).unwrap();
  }
}

#[cfg(test)]
mod watch_tests {
  use super::*;

  #[test]
  fn ignores_noisy_directories() {
    assert!(is_ignored_path(std::path::Path::new(
      "/repo/node_modules/pkg/index.js"
    )));
    assert!(is_ignored_path(std::path::Path::new(
      "/repo/.git/index.lock"
    )));
    assert!(is_ignored_path(std::path::Path::new(
      "/repo/target/debug/markify"
    )));
    assert!(!is_ignored_path(std::path::Path::new(
      "/repo/docs/notes.md"
    )));
  }

  #[test]
  fn ignores_editor_temporary_files() {
    assert!(is_ignored_path(std::path::Path::new(
      "/repo/docs/.notes.md.swp"
    )));
    assert!(is_ignored_path(std::path::Path::new(
      "/repo/docs/notes.md~"
    )));
    assert!(is_ignored_path(std::path::Path::new(
      "/repo/docs/.DS_Store"
    )));
  }

  #[test]
  fn normalizes_and_deduplicates_watch_paths() {
    let paths = normalized_watch_paths(&[
      "/repo/docs/".to_string(),
      "/repo\\docs".to_string(),
      "/repo/docs/more".to_string(),
      "   ".to_string(),
    ]);

    assert_eq!(
      paths,
      vec!["/repo/docs".to_string(), "/repo/docs/more".to_string()]
    );
  }

  #[test]
  fn keeps_the_separator_of_a_drive_root() {
    assert_eq!(
      normalized_watch_paths(&["C:\\".to_string()]),
      vec!["C:/".to_string()]
    );
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
    .manage(WatchState::default())
    .plugin(
      tauri_plugin_window_state::Builder::default()
        .with_state_flags(
          tauri_plugin_window_state::StateFlags::SIZE
            | tauri_plugin_window_state::StateFlags::POSITION
            | tauri_plugin_window_state::StateFlags::MAXIMIZED,
        )
        .build(),
    )
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      read_markdown_file,
      write_markdown_file,
      write_pdf_file,
      read_image_base64,
      save_image,
      save_image_from_path,
      read_system_fonts,
      list_directory,
      create_entry,
      rename_entry,
      duplicate_entry,
      delete_entry,
      move_entry,
      set_watched_paths
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
  use windows_core::Interface;

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
