# Markify

> Cross-platform Markdown editor built with **Tauri 2 (Rust)** and **Angular**.
>
> Éditeur Markdown multiplateforme développé avec **Tauri 2 (Rust)** et **Angular**.

🇬🇧 [English](#english) · 🇫🇷 [Français](#français)

**Markify** is a desktop application for writing and reading Markdown documents, available on **Windows, macOS and Linux**. It combines a modern Angular frontend with a lightweight Rust backend, a custom VS Code-style interface, and full localization.

*Markify est une application de bureau pour écrire et lire des documents Markdown, disponible sur **Windows, macOS et Linux**. Elle associe un frontend Angular moderne à un backend Rust léger, une interface personnalisée inspirée de VS Code et une localisation complète.*

---

## English

### Why this project stands out

- **Full-stack desktop development**: Angular (TypeScript) frontend + Rust backend communicating through Tauri commands
- **UI/UX craft**: custom title bar inspired by VS Code, adapted per platform (native macOS traffic lights, custom window controls elsewhere), window dragging, dropdown menus with submenus
- **Internationalization**: UI fully translated into 4 languages (French, English, German, Spanish), automatic detection of the system language, persisted choice, type-safe translations verified at compile time
- **Theming**: light/dark themes that follow the system preference in real time, through a CSS design-token system
- **Software engineering practices**: service architecture with Angular Signals, unit testing (29 tests, Vitest), Tauri capability permissions model

### Features

- **Open & save** Markdown files (`.md`, `.markdown`) with native file dialogs
- **Three view modes**: Read, Edit, and Hybrid (edit + live preview side by side)
- **Undo/Redo** with grouped typing history, **Cut/Copy/Paste** via the native clipboard
- **4 languages**: Français, English, Deutsch, Español
- **Light & dark themes** following the system
- Save confirmation notifications (toast)
- **Custom title bar** (VS Code style) with menus, submenus and window controls — native traffic lights on macOS, custom controls on Windows/Linux

### Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Angular 22, TypeScript, Angular Signals, marked |
| Desktop shell | Tauri 2 |
| Backend | Rust — `std::fs` file I/O, Tauri commands |
| Plugins | `dialog`, `clipboard-manager`, `log` |
| Testing | Vitest, @angular/build:unit-test |

### Architecture

```
Markify/
├── src/                        # Angular frontend
│   ├── app/
│   │   ├── components/
│   │   │   ├── title-bar/      # Custom title bar, menus, window controls
│   │   │   └── editor-view/    # Markdown editor (read / edit / hybrid)
│   │   ├── i18n/               # Translations (FR/EN/DE/ES) + i18n service
│   │   └── services/           # Document, Theme, Toast, EditorRef services
│   └── test-setup.ts           # Tauri API mocks for unit tests
└── src-tauri/                  # Rust backend
    ├── src/lib.rs              # Tauri app, file I/O commands, plugins
    ├── capabilities/           # Permission model (windows, dialogs, clipboard…)
    └── tauri.macos.conf.json   # macOS-specific window configuration
```

The frontend and backend communicate through typed Tauri commands (`read_markdown_file`, `write_markdown_file`) and official plugins, all gated by a declarative capabilities/permissions system.

### Getting started

**Prerequisites**: Node.js ≥ 22, Rust, and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) (on Linux: `webkit2gtk-4.1`, GTK 3, `libsoup-3.0`).

```bash
npm install         # Install frontend dependencies
npm run tauri:dev   # Run the app in development mode
npm test            # Run the unit tests (Vitest)
npm run tauri:build # Build a production bundle (.deb, .AppImage, .msi, .dmg…)
```

### Testing

29 unit tests covering the document service (open/save/new, undo/redo, clipboard operations), the i18n service (all 4 languages, persistence), the theme service and the title bar menus. Tauri APIs are mocked in `src/test-setup.ts` to run in isolation.

### License

AGPL-3.0

---

## Français

### Ce qui rend ce projet intéressant

- **Développement desktop full-stack** : frontend Angular (TypeScript) + backend Rust communiquant via des commandes Tauri
- **Soin de l'UI/UX** : barre de titre personnalisée inspirée de VS Code, adaptée à chaque plateforme (traffic lights natifs sur macOS, contrôles de fenêtre personnalisés ailleurs), gestion du drag de la fenêtre, menus déroulants avec sous-menus
- **Internationalisation** : interface entièrement traduite en 4 langues (français, anglais, allemand, espagnol), détection automatique de la langue du système, choix mémorisé, traductions typées vérifiées à la compilation
- **Thème clair/sombre** : suit la préférence du système en temps réel, via un système de design tokens CSS
- **Pratiques d'ingénierie** : architecture en services avec les Signals d'Angular, tests unitaires (29 tests, Vitest), modèle de permissions de Tauri

### Fonctionnalités

- **Ouvrir & enregistrer** des fichiers Markdown (`.md`, `.markdown`) avec les boîtes de dialogue natives
- **Trois modes de vue** : Lecture, Édition et Hybride (édition + aperçu en direct côte à côte)
- **Annuler/Rétablir** avec historique de frappe groupé, **Couper/Copier/Coller** via le presse-papiers natif
- **4 langues** : Français, English, Deutsch, Español
- **Thèmes clair & sombre** suivant le système
- Notifications de sauvegarde (toast)
- **Barre de titre personnalisée** (style VS Code) avec menus, sous-menus et contrôles de fenêtre — traffic lights natifs sur macOS, contrôles personnalisés sur Windows/Linux

### Technologies utilisées

| Couche | Technologie |
| --- | --- |
| Frontend | Angular 22, TypeScript, Angular Signals, marked |
| Coquille desktop | Tauri 2 |
| Backend | Rust — entrées/sorties fichiers `std::fs`, commandes Tauri |
| Plugins | `dialog`, `clipboard-manager`, `log` |
| Tests | Vitest, @angular/build:unit-test |

### Architecture

```
Markify/
├── src/                        # Frontend Angular
│   ├── app/
│   │   ├── components/
│   │   │   ├── title-bar/      # Barre de titre, menus, contrôles de fenêtre
│   │   │   └── editor-view/    # Éditeur Markdown (lecture / édition / hybride)
│   │   ├── i18n/               # Traductions (FR/EN/DE/ES) + service i18n
│   │   └── services/           # Services Document, Theme, Toast, EditorRef
│   └── test-setup.ts           # Mocks des API Tauri pour les tests unitaires
└── src-tauri/                  # Backend Rust
    ├── src/lib.rs              # Application Tauri, commandes fichiers, plugins
    ├── capabilities/           # Modèle de permissions (fenêtres, dialogs, presse-papiers…)
    └── tauri.macos.conf.json   # Configuration fenêtre spécifique à macOS
```

Le frontend et le backend communiquent via des commandes Tauri typées (`read_markdown_file`, `write_markdown_file`) et des plugins officiels, tous encadrés par un système déclaratif de capacités/permissions.

### Démarrage rapide

**Prérequis** : Node.js ≥ 22, Rust, et les [dépendances système de Tauri](https://tauri.app/start/prerequisites/) (sur Linux : `webkit2gtk-4.1`, GTK 3, `libsoup-3.0`).

```bash
npm install         # Installer les dépendances frontend
npm run tauri:dev   # Lancer l'application en mode développement
npm test            # Lancer les tests unitaires (Vitest)
npm run tauri:build # Générer un paquet de production (.deb, .AppImage, .msi, .dmg…)
```

### Tests

29 tests unitaires couvrant le service document (ouvrir/enregistrer/créer, annuler/rétablir, opérations presse-papiers), le service i18n (les 4 langues, persistance), le service de thème et les menus de la barre de titre. Les API Tauri sont mockées dans `src/test-setup.ts` pour fonctionner en isolation.

### Licence

AGPL-3.0
