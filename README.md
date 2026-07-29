# Markify

**FR** — Lecteur et convertisseur Markdown multiplateforme.

Markify permet de lire, prévisualiser et convertir des fichiers Markdown vers d'autres formats (HTML, PDF, etc.). L'application fonctionne hors ligne, sans connexion internet.

**EN** — Cross-platform Markdown reader and converter.

Markify lets you read, preview and convert Markdown files to other formats (HTML, PDF, etc.). The application works offline with no internet connection required.

---

## Stack technique / Tech Stack

| Couche / Layer | Technologie |
|---|---|
| Frontend | Angular 22 — TypeScript 6 |
| Backend | Rust — Tauri 2 |
| UI native | WebView (WebKitGTK / WebView2 / Android WebView) |
| Bundling | Vite (via `@angular/build`) |
| Markdown | `marked` |
| Dialogues | `@tauri-apps/plugin-dialog` |

### Cibles / Targets

- **Linux** : `.deb` (Debian/Ubuntu), `.rpm` (Fedora/RHEL), AppImage
- **Windows** : `.exe` (NSIS), `.msi` (WiX)
- **Android** : `.apk`, `.aab` (Play Store)

---

## Prerequisites / Prérequis

- Node.js 22+
- Rust 1.77+
- Android SDK + NDK (pour la cible Android)

---

## Scripts disponibles / Available scripts

```bash
npm run tauri:dev              # Développement desktop (hot-reload)
npm run tauri:build            # Build desktop (paquet .deb/.rpm/.appimage)
npm run tauri:android          # Développement Android (hot-reload)
npm run tauri:android:build    # Build Android .apk
npm run tauri:android:bundle   # Build Android .aab (release)
```
