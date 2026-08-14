# Markify

> Cross-platform Markdown editor built with **Tauri 2 (Rust)** and **Angular**.
>
> Éditeur Markdown multiplateforme développé avec **Tauri 2 (Rust)** et **Angular**.

🇬🇧 [English](#english) · 🇫🇷 [Français](#français)

**Markify** is a desktop application for writing and reading Markdown documents, available on **Windows, macOS and Linux**. It combines a modern Angular frontend with a lightweight Rust backend, a custom VS Code-style interface, and full localization.

_Markify est une application de bureau pour écrire et lire des documents Markdown, disponible sur **Windows, macOS et Linux**. Elle associe un frontend Angular moderne à un backend Rust léger, une interface personnalisée inspirée de VS Code et une localisation complète._

---

## English

### Why this project stands out

- **Full-stack desktop development**: Angular (TypeScript) frontend + Rust backend communicating through Tauri commands
- **UI/UX craft**: custom title bar inspired by VS Code, adapted per platform (native macOS traffic lights, custom window controls elsewhere), window dragging, dropdown menus with submenus
- **Internationalization**: UI fully translated into 4 languages (French, English, German, Spanish), automatic detection of the system language, persisted choice, type-safe translations verified at compile time
- **Theming**: light/dark themes that follow the system preference in real time, through a CSS design-token system
- **Software engineering practices**: service architecture with Angular Signals, unit testing (82 tests, Vitest), Tauri capability permissions model

### Features

- **Open & save** Markdown files (`.md`, `.markdown`, `.mdx`) with native file dialogs
- **Export to PDF** (File → Export, `Ctrl/Cmd+E`): full rendering with system fonts and embedded images, native save dialog
- **Three view modes**: Read, Edit, and Hybrid (edit + live preview side by side)
- **Undo/Redo** with grouped typing history, **Cut/Copy/Paste** via the native clipboard
- **4 languages**: Français, English, Deutsch, Español
- **Light & dark themes** following the system
- Save confirmation notifications (toast)
- **Custom title bar** (VS Code style) with menus, submenus and window controls — native traffic lights on macOS, custom controls on Windows/Linux
- **About dialog**: real-time app version, clickable developer profile (opens in the system browser)

### Tech stack

| Layer         | Technology                                      |
| ------------- | ----------------------------------------------- |
| Frontend      | Angular 22, TypeScript, Angular Signals, marked |
| Desktop shell | Tauri 2                                         |
| Backend       | Rust — `std::fs` file I/O, Tauri commands       |
| Plugins       | `dialog`, `clipboard-manager`, `log`, `opener`  |
| Testing       | Vitest, @angular/build:unit-test                |

### Architecture

```
Markify/
├── .github/                    # CI: automatic cross-platform releases (build-release.yml, build-msix.ps1)
├── CHANGELOG.md                # Version history (Keep a Changelog)
├── src/                        # Angular frontend
│   ├── app/
│   │   ├── components/
│   │   │   ├── title-bar/      # Custom title bar, menus, window controls
│   │   │   ├── editor-view/    # Markdown editor (read / edit / hybrid)
│   │   │   └── about-dialog/   # About dialog (automatic version, developer link)
│   │   ├── i18n/               # Translations (FR/EN/DE/ES) + i18n service
│   │   ├── services/           # Document, Theme, Toast, EditorRef services
│   │   └── utils/              # PDF export
│   └── test-setup.ts           # Tauri API mocks for unit tests
└── src-tauri/                  # Rust backend
    ├── src/lib.rs              # Tauri app, file I/O commands, plugins
    ├── capabilities/           # Permission model (windows, dialogs, clipboard…)
    └── tauri.macos.conf.json   # macOS-specific window configuration
```

The frontend and backend communicate through typed Tauri commands (`read_markdown_file`, `write_markdown_file`, `read_system_fonts`, `read_image_base64`, `write_pdf_file`) and official plugins, all gated by a declarative capabilities/permissions system.

### Getting started

**Prerequisites**: Node.js ≥ 22, Rust, and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) (on Linux: `webkit2gtk-4.1`, GTK 3, `libsoup-3.0`).

```bash
npm install         # Install frontend dependencies
npm run tauri:dev   # Run the app in development mode
npm test            # Run the unit tests (Vitest)
npm run tauri:build # Build a production bundle (.deb, .AppImage, .msi, .msix, .dmg…)
```

### Testing

82 unit tests (12 files) covering the document service (open/save/new, undo/redo, clipboard operations), the i18n service (all 4 languages, persistence), the theme service, the title bar menus, the about dialog and the PDF export. Tauri APIs are mocked in `src/test-setup.ts` to run in isolation.

### Releases

Pushing to `main` triggers a GitHub Actions workflow that computes the next version (`YYYY.M.N`), builds the full cross-platform matrix (Windows `.msi`/`.exe`, macOS `.dmg`, Linux `.deb`/`.rpm`) plus an **MSIX package** for the Microsoft Store, and publishes a GitHub release. Release notes link to the changelog; the full history lives in [CHANGELOG.md](CHANGELOG.md).

### License

AGPL-3.0

---

## Français

### Ce qui rend ce projet intéressant

- **Développement desktop full-stack** : frontend Angular (TypeScript) + backend Rust communiquant via des commandes Tauri
- **Soin de l'UI/UX** : barre de titre personnalisée inspirée de VS Code, adaptée à chaque plateforme (traffic lights natifs sur macOS, contrôles de fenêtre personnalisés ailleurs), gestion du drag de la fenêtre, menus déroulants avec sous-menus
- **Internationalisation** : interface entièrement traduite en 4 langues (français, anglais, allemand, espagnol), détection automatique de la langue du système, choix mémorisé, traductions typées vérifiées à la compilation
- **Thème clair/sombre** : suit la préférence du système en temps réel, via un système de design tokens CSS
- **Pratiques d'ingénierie** : architecture en services avec les Signals d'Angular, tests unitaires (82 tests, Vitest), modèle de permissions de Tauri

### Fonctionnalités

- **Ouvrir & enregistrer** des fichiers Markdown (`.md`, `.markdown`, `.mdx`) avec les boîtes de dialogue natives
- **Exporter en PDF** (Fichier → Exporter, `Ctrl/Cmd+E`) : rendu complet avec polices système et images intégrées, dialogue d'enregistrement natif
- **Trois modes de vue** : Lecture, Édition et Hybride (édition + aperçu en direct côte à côte)
- **Annuler/Rétablir** avec historique de frappe groupé, **Couper/Copier/Coller** via le presse-papiers natif
- **4 langues** : Français, English, Deutsch, Español
- **Thèmes clair & sombre** suivant le système
- Notifications de sauvegarde (toast)
- **Barre de titre personnalisée** (style VS Code) avec menus, sous-menus et contrôles de fenêtre — traffic lights natifs sur macOS, contrôles personnalisés sur Windows/Linux
- **Boîte À propos** : version de l'application en temps réel, profil de l'éditeur cliquable (ouvert dans le navigateur système)

### Technologies utilisées

| Couche           | Technologie                                                |
| ---------------- | ---------------------------------------------------------- |
| Frontend         | Angular 22, TypeScript, Angular Signals, marked            |
| Coquille desktop | Tauri 2                                                    |
| Backend          | Rust — entrées/sorties fichiers `std::fs`, commandes Tauri |
| Plugins          | `dialog`, `clipboard-manager`, `log`, `opener`             |
| Tests            | Vitest, @angular/build:unit-test                           |

### Architecture

```
Markify/
├── .github/                    # CI : releases multiplateformes automatiques (build-release.yml, build-msix.ps1)
├── CHANGELOG.md                # Historique des versions (Keep a Changelog)
├── src/                        # Frontend Angular
│   ├── app/
│   │   ├── components/
│   │   │   ├── title-bar/      # Barre de titre, menus, contrôles de fenêtre
│   │   │   ├── editor-view/    # Éditeur Markdown (lecture / édition / hybride)
│   │   │   └── about-dialog/   # Boîte À propos (version automatique, lien éditeur)
│   │   ├── i18n/               # Traductions (FR/EN/DE/ES) + service i18n
│   │   ├── services/           # Services Document, Theme, Toast, EditorRef
│   │   └── utils/              # Export PDF
│   └── test-setup.ts           # Mocks des API Tauri pour les tests unitaires
└── src-tauri/                  # Backend Rust
    ├── src/lib.rs              # Application Tauri, commandes fichiers, plugins
    ├── capabilities/           # Modèle de permissions (fenêtres, dialogs, presse-papiers…)
    └── tauri.macos.conf.json   # Configuration fenêtre spécifique à macOS
```

Le frontend et le backend communiquent via des commandes Tauri typées (`read_markdown_file`, `write_markdown_file`, `read_system_fonts`, `read_image_base64`, `write_pdf_file`) et des plugins officiels, tous encadrés par un système déclaratif de capacités/permissions.

### Démarrage rapide

**Prérequis** : Node.js ≥ 22, Rust, et les [dépendances système de Tauri](https://tauri.app/start/prerequisites/) (sur Linux : `webkit2gtk-4.1`, GTK 3, `libsoup-3.0`).

```bash
npm install         # Installer les dépendances frontend
npm run tauri:dev   # Lancer l'application en mode développement
npm test            # Lancer les tests unitaires (Vitest)
npm run tauri:build # Générer un paquet de production (.deb, .AppImage, .msi, .msix, .dmg…)
```

### Tests

82 tests unitaires (12 fichiers) couvrant le service document (ouvrir/enregistrer/créer, annuler/rétablir, opérations presse-papiers), le service i18n (les 4 langues, persistance), le service de thème, les menus de la barre de titre, la boîte À propos et l'export PDF. Les API Tauri sont mockées dans `src/test-setup.ts` pour fonctionner en isolation.

### Releases

Pousser sur `main` déclenche un workflow GitHub Actions qui calcule la version suivante (`YYYY.M.N`), construit la matrice multiplateforme complète (`.msi`/`.exe` Windows, `.dmg` macOS, `.deb`/`.rpm` Linux) plus un **paquet MSIX** pour le Microsoft Store, et publie une release GitHub. Les notes de release renvoient vers le changelog ; l'historique complet est dans [CHANGELOG.md](CHANGELOG.md).

### Licence

AGPL-3.0
