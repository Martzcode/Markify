# Release automatique (GitHub Actions)

Workflow : `.github/workflows/build-release.yml`

- **PR vers `main`** : build de validation sur Windows, Debian, Fedora et macOS (pas de release, pas de bump de version).
- **Push vers `main`** : version `YYYY.MM.x` calculée automatiquement (dernière release du mois + 1, sinon `.1`), builds puis release GitHub publiée :
  - Windows : `.msi` (WiX) + `-setup.exe` (NSIS)
  - Debian : `.deb`
  - Fedora : `.rpm`
  - macOS : `.dmg` universel (Intel + Apple Silicon)

La version est appliquée dans `package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`.

## Deux formats de version

Tauri exige une version semver : `2026.08.1` est invalide (semver interdit les zéros en tête). Il y a donc deux numéros par release :

| Usage | Format | Exemple |
|---|---|---|
| Tag et titre de la release GitHub | CalVer `YYYY.MM.x` | `2026.08.2` |
| Version interne (configs, installateurs) | Semver `YYYY.M.x` | `2026.8.2` |

Le nom des artefacts reflète la version semver (ex. `Markify_2026.8.2_x64-setup.exe`).

### Contrainte MSI Windows

L'installateur MSI limite chaque segment de version à 255 : `2026.8.2` est rejeté ("app version major number cannot be greater than 255"). Le script définit donc une **version MSI dédiée** dans `tauri.conf.json > bundle.windows.wix.version` : année − 2000 (ex. `26.8.2`), utilisée uniquement par l'installateur MSI. Le NSIS garde la version semver (compatible, max 65535 par segment).

### Windows x64 uniquement

Le build Windows est verrouillé sur `x86_64-pc-windows-msvc` (`--target`). Les noms d'artefacts portent l'architecture : `Markify_2026.8.2_x64.msi` et `Markify_2026.8.2_x64-setup.exe` (le suffixe de langue `en-US` de Tauri est retiré du nom du MSI par le workflow).

## Points d'attention

- **Artefacts non signés** : aucun certificat de signature n'est configuré (Apple Developer, Windows Authenticode). Résultats :
  - macOS : Gatekeeper bloque l'ouverture ("développeur non vérifié"), l'utilisateur doit autoriser via Réglages système > Confidentialité et sécurité.
  - Windows : SmartScreen affiche un avertissement "éditeur inconnu". La signature ad-hoc macOS (`signingIdentity: "-"` dans `tauri.macos.conf.json`) évite que le build échoue en CI mais ne supprime pas l'avertissement.
- **Collision de version** : le `concurrency` du workflow et une boucle de retry dans le calcul de version évitent les doublons si deux pushes arrivent en même temps sur `main`.
- **Runners GitHub seulement** : le `.rpm` est construit sur un runner Ubuntu (tooling `rpm` installé), pas sur une vraie machine Fedora.