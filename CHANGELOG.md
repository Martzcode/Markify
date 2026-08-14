# Changelog

Toutes les modifications notables de Markify sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [2026.08.4] - 2026-08-14

### Ajouté

- Lien vers le profil GitHub de l'éditeur dans la boîte **À propos** (« Martzcode » ouvre le navigateur).
- Affichage automatique du numéro de version dans **À propos**, synchronisé avec la version réelle de l'application.
- Identité d'éditeur du paquet MSIX alignée sur le compte Microsoft Store (`Martzcode`).

### Corrigé

- Le menu et les sous-menus restaient affichés après un clic sur une option : ils se ferment désormais après l'action.

## [2026.08.3] - 2026-08-14

### Ajouté

- Paquet MSIX x64 (`Markify_2026.8.3_x64.msix`) généré et signé en CI (auto-signé par défaut, ou avec le PFX fourni en secret).

### Retiré

- Paquet MSI dédié au Microsoft Store des artefacts de release (le MSIX le remplace).

## [2026.08.2] - 2026-08-14

### Ajouté

- Export PDF complet depuis le menu **Fichier → Exporter…** (raccourci `Ctrl/Cmd+E`), avec dialogue d'enregistrement et nom de fichier par défaut basé sur le document ouvert.
- Intégration des images distantes et locales dans les PDF exportés, redimensionnées à la largeur du contenu (comme dans l'aperçu).
- Utilisation d'une police système adaptée au contenu du document pour les PDF exportés (symboles Unicode rendus correctement).

### Corrigé

- Symboles Unicode (ex. Ⓖ) qui s'affichaient comme un carré vide dans les PDF exportés.
- Images inaccessibles ou invalides qui bloquaient l'export : elles sont désormais ignorées, avec un message récapitulatif à la fin de l'export.
- Images trop grandes ou trop petites dans les PDF exportés (dimensionnement fidèle à l'aperçu).

## [2026.08.1] - 2026-08-12

### Ajouté

- Markify : éditeur Markdown de bureau (Angular + Tauri) avec aperçu en direct.
- Ouverture et lecture de fichiers `.md`.
- Édition et sauvegarde des fichiers.
- Barre de menus **Fichier / Édition** avec raccourcis clavier, y compris la barre de menus native sur macOS.
- Mode de vue hybride (éditeur + aperçu).
- Coloration syntaxique des blocs de code et bouton de copie.
- Conversion d'un document en PDF (menu contextuel).
- Interface multilingue : français, anglais, allemand et espagnol.
- Fenêtre native (Windows, macOS, Linux) avec logo.
- Dialogue **À propos**.
- Workflow de build de release multiplateforme (GitHub Actions).
