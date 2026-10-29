# Changelog

Toutes les modifications notables de Markify sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [2026.10.12] - 2026-10-29

### Ajouté

- **Images locales** : les chemins relatifs (`./assets/photo.png`, `../images/…`) sont résolus par rapport au dossier du document et affichés dans l'aperçu via le protocole `asset:` de Tauri. Les images distantes continuent de fonctionner ; les sources `asset:` ou situées hors du dossier du document sont refusées.
- **Collage et glisser-déposer** : une image copiée dans le presse-papiers ou déposée sur l'éditeur est enregistrée dans un dossier `assets/` à côté du document, puis insérée sous forme de lien Markdown (`![alt](./assets/nom.png)`). Un document non enregistré est sauvegardé au préalable.
- **Édition → Insérer une image…** : un sélecteur de fichier copie l'image choisie dans `./assets` et insère le lien à la position du curseur.
- Commandes Rust `save_image` (données base64 du presse-papiers) et `save_image_from_path` (fichier déposé ou sélectionné) ; les noms sont assainis et un suffixe numérique évite d'écraser une image existante.
- **Correcteur orthographique** : le correcteur natif de la WebView est activé par défaut et se désactive via **Affichage → Vérifier l’orthographe**. La langue suit le système ou peut être fixée au français, à l’anglais, à l’allemand ou à l’espagnol ; le choix est mémorisé et le surlignage syntaxique de l’éditeur reste intact.

### Modifié

- Le protocole `asset:` est activé dans la configuration Tauri et autorisé dans la CSP (`http://asset.localhost`), avec un périmètre limité côté frontend au dossier du document.

## [2026.10.11] - 2026-10-29

### Modifié

- **Bouton de thème unique** : les trois icônes séparées (soleil, lune, auto) sont remplacées par un seul bouton dont l'icône reflète le mode courant. Chaque clic passe au mode suivant : clair → sombre → auto → clair.
- L'info-bulle, traduite dans les 4 langues, annonce le mode courant et le mode suivant ; le choix reste mémorisé entre les sessions.

## [2026.10.10] - 2026-10-29

### Ajouté

- **Sélecteur de thème à trois états** dans la barre de titre, à gauche du bouton Réduire : soleil pour le thème clair, lune pour le thème sombre et cercle mi-rempli pour le mode automatique (système).
- Info-bulles traduites dans les 4 langues et état actif visible sur le bouton sélectionné ; le choix est mémorisé entre les sessions (`markify.theme`).
- En mode automatique, le thème suit les changements du système en temps réel ; en mode clair ou sombre, ces changements sont ignorés.

### Corrigé

- **Styles globaux absents en production** : Angular générait `<link media="print" onload="…">` pour charger le CSS de façon asynchrone. Cet `onload` inline étant bloqué par la CSP stricte, la feuille globale (dont Font Awesome) ne s'appliquait jamais. L'inlining critique est désactivé au profit d'un `<link rel="stylesheet">` classique.
- **Styles de composants bloqués en production** : Tauri injectait des nonces/hashs dans `style-src`, ce qui neutralisait `'unsafe-inline'` et empêchait l'application des `<style>` créés par Angular à l'exécution. L'injection automatique est désormais désactivée pour `style-src` uniquement ; `script-src` conserve sa protection stricte.

## [2026.10.9] - 2026-10-29

### Ajouté

- **Aperçu sécurisé** : le HTML produit par le rendu Markdown est désormais assaini avec DOMPurify avant d'être injecté dans l'aperçu (balises actives, gestionnaires `on*` et schémas de liens dangereux retirés).
- Option **Affichage → Autoriser le HTML brut**, désactivée par défaut et mémorisée entre les sessions. Lorsqu'elle est active, le HTML reste assaini : les balises comme `<script>`, `<iframe>` ou les attributs `onerror` ne sont jamais exécutés.
- Les liens dont le schéma n'est ni `http`, `https`, `mailto`, relatif ou une ancre sont rendus en texte simple plutôt qu'en lien cliquable.
- **CSP stricte** en production (`script-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `form-action 'none'`) à la place de la politique `null` ; les scripts de démarrage sont déplacés dans `public/bootstrap.js`.

### Modifié

- L'export PDF réutilise le même assainisseur tout en conservant les styles inline nécessaires aux couleurs des blocs de code.
- La commande Rust `read_image_base64` exige désormais le dossier du document et refuse toute image située en dehors : un fichier Markdown non fiable ne peut plus exfiltrer un fichier arbitraire dans un PDF exporté.

### Corrigé

- Les ancres de titres dont l'`id` correspond à une propriété de `document` (par exemple `title`) ne sont plus supprimées par l'assainisseur, ce qui préserve la table des matières et la navigation interne.

## [2026.10.8] - 2026-10-28

### Ajouté

- **Coloration syntaxique des blocs de code** dans l'aperçu et l'export PDF, via `highlight.js` limité à 25 langages courants (JavaScript/TypeScript, Python, Rust, Go, Java, C/C++, C#, PHP, Ruby, Kotlin, Swift, SQL, HTML/XML, CSS/SCSS, JSON, YAML, TOML/INI, Bash, Dockerfile, diff, Markdown…).
- Palettes claire et sombre alignées sur le thème de l'interface ; un langage inconnu ou absent retombe sur du texte échappé, sans erreur.
- **Numéros de ligne optionnels** (désactivés par défaut) pour les blocs de code de l'aperçu, activables via **Affichage → Numéros de ligne du code** et mémorisés entre les sessions. La gouttière reste alignée sur le code et n'est ni copiée ni prise en compte par la recherche.
- L'export PDF reprend les couleurs sous forme de styles inline, `html-to-pdfmake` ignorant les classes CSS.

### Corrigé

- Le contenu des blocs de code est désormais échappé avant rendu : un bloc contenant du HTML n'est plus interprété dans l'aperçu (injection HTML), et le texte copié reste identique à la source.

## [2026.10.7] - 2026-10-28

### Ajouté

- **Rechercher / remplacer dans le document** (`Ctrl/Cmd+F`, `Ctrl/Cmd+H`) : barre flottante avec compteur d'occurrences, navigation précédent/suivant (`Entrée` / `Maj+Entrée`), respect de la casse, mot entier et expressions régulières.
- Surlignage des occurrences dans l'éditeur (occurrence courante distinguée) et dans l'aperçu ; la navigation sélectionne l'occurrence et fait défiler le volet concerné.
- **Remplacer** et **Remplacer tout**, avec toast du nombre de remplacements ; « Remplacer tout » ne crée qu'une seule étape d'annulation et les références `$1`…`$9` sont développées en mode expression régulière.
- Options de recherche mémorisées entre les sessions, entrées **Édition → Rechercher… / Remplacer…** et libellés traduits dans les 4 langues.

## [2026.10.6] - 2026-10-28

### Corrigé

- **Fermer le dossier** ne fonctionnait pas quand un document était ouvert : l'effet qui révèle le fichier courant relisait la racine de l'explorateur et rouvrait le dossier aussitôt après sa fermeture. Cet effet ne dépend désormais que du chemin du document.

### Modifié

- Fermer le dossier avec un document ouvert demande maintenant confirmation (« Tout fermer » / « Annuler »). En cas de validation, le document est fermé lui aussi, avec le garde-fou des modifications non enregistrées, puis le dossier est vidé et masqué.

## [2026.10.5] - 2026-10-28

### Ajouté

- **Fermer le dossier courant** sans fermer le document ouvert : entrée de menu **Fichier → Fermer le dossier** et bouton dédié dans l'en-tête de l'explorateur. L'arborescence est vidée, le panneau masqué et le dossier n'est plus restauré au prochain lancement.
- **Enregistrer sous…** (`Ctrl/Cmd+Shift+S`) : enregistre le document à un nouvel emplacement et le rattache à ce fichier.
- **Enregistrer une copie…** : écrit une copie suffixée du document sans changer le fichier courant ni son état modifié.
- Nouveaux libellés traduits dans les 4 langues et toasts de confirmation.

## [2026.10.4] - 2026-10-28

### Ajouté

- **Fermer le document courant** sans fermer la fenêtre, via l'entrée de menu **Fichier → Fermer le document** et le raccourci `Ctrl+W` (`Cmd+W` sur macOS). Le garde-fou des modifications non enregistrées s'applique comme pour les autres actions ; Markify revient à l'écran d'accueil et masque la table des matières.

## [2026.10.3] - 2026-10-28

### Corrigé

- Fenêtre qui rétrécissait légèrement à chaque ouverture sur Linux (GTK/Wayland) : la taille restaurée par le plugin `window-state` était appliquée avant l'affichage de la fenêtre, si bien que GTK la réduisait de l'épaisseur de son ombre à chaque lancement. La taille est désormais mémorisée dans la session et réappliquée une fois la fenêtre affichée, ce qui la stabilise d'un lancement à l'autre.

## [2026.10.2] - 2026-10-28

### Ajouté

- Protection contre la perte de modifications non enregistrées : un dialogue **Enregistrer / Ne pas enregistrer / Annuler** s'affiche avant de créer un nouveau document, d'en ouvrir un autre, de cliquer sur un fichier dans l'explorateur ou de fermer la fenêtre (croix, `Alt+F4`, menu Quitter).
- Interception de la fermeture de fenêtre via `onCloseRequested` (Tauri) : la fenêtre reste ouverte si l'utilisateur annule, et se ferme après enregistrement ou perte confirmée.
- **Restauration de session** : au démarrage, Markify rouvre le dernier fichier et dossier, réapplique le mode de vue, les panneaux visibles, les dossiers dépliés et la position de défilement, et restaure la taille, la position et l'état maximisé de la fenêtre (plugin Tauri `window-state`).
- Si le fichier ou le dossier de la dernière session n'existe plus, l'application démarre proprement (toast d'avertissement pour le fichier) au lieu d'échouer.

### Amélioré

- `DocumentService.saveFile()` et les actions d'ouverture renvoient désormais un booléen indiquant si l'opération a abouti, ce qui permet d'interrompre proprement les actions en cours lorsqu'un enregistrement est annulé ou échoue.

## [2026.10.1] - 2026-10-17

### Amélioré

- Classement de l'application dans la catégorie « Bureautique » des menus d'applications Linux (fichier `.desktop` : `Categories=Office;`) au lieu de la catégorie « Autres ».

## [2026.09.2] - 2026-09-14

### Ajouté

- Ouverture d'un lien de l'aperçu dans le navigateur par défaut du système au clic (au lieu d'une navigation dans la fenêtre de l'application), y compris au clavier (`Entrée`/`Espace`). Les ancres internes (`#titre`) continuent de faire défiler l'aperçu normalement.

### Amélioré

- Affichage de l'adresse complète d'un lien de l'aperçu dans une info-bulle lors du survol, ce qui permet de vérifier la destination avant de cliquer.

### Corrigé

- Aperçu tronqué sans barre de défilement pour les documents contenant de très larges blocs de code ou tableaux (contenu pouvant dépasser 3000 px) : la zone de lecture autorise désormais le défilement (horizontal et vertical) quelle que soit la largeur du contenu.
- Tableaux Markdown trop larges qui débordaient de la fenêtre : ils sont maintenant scrollables à l'intérieur de l'aperçu.

## [2026.09.1] - 2026-09-13

### Ajouté

- Table des matières dans une barre latérale : le contenu du document est listé sous forme de titres cliquables, avec indentation selon le niveau de titre (`H1`–`H6`).
- Navigation depuis la table des matières : un clic sur un titre fait défiler l'aperçu (mode lecture) et/ou l'éditeur (mode édition/hybride) jusqu'à la section correspondante, avec synchronisation du surlignage dans l'éditeur.
- Barre d'activités latérale (style VS Code) regroupant les boutons d'ouverture de l'explorateur de fichiers et de la table des matières, en remplacement du bouton flottant de l'explorateur.
- Raccourci **Affichage → Afficher/Masquer la table des matières** dans les menus.
- Identifiants (`id`) attribués aux titres du rendu Markdown, cohérents avec ceux de la table des matières.
- Dépendance `@fortawesome/fontawesome-free` pour le jeu d'icônes de l'interface.

### Amélioré

- Exclusivité des panneaux latéraux : ouvrir l'explorateur ferme la table des matières (et inversement).
- Iconographie remplacée par les pictogrammes Font Awesome (barre de titre sur Windows, contrôles d'arbres de l'explorateur, bouton de fermeture des panneaux).
- Marge de défilement (`scroll-margin-top`) appliquée aux titres de l'aperçu pour que la cible de navigation ne soit pas recollée au bord supérieur.

## [2026.08.9] - 2026-08-20

### Ajouté

- Barre latérale (explorateur de fichiers) affichant l'arborescence complète du dossier ouvert : fichiers, sous-dossiers et fichiers des sous-dossiers, avec dépliage/pliement des dossiers (chargement à la demande, comme VS Code).
- Menu **Fichier → Ouvrir un dossier…** (raccourci `Ctrl/Cmd+Shift+O`) pour choisir un dossier à explorer.
- Affichage automatique de la barre latérale à l'ouverture d'un dossier ou d'un fichier (le dossier parent du fichier est alors chargé et le fichier est surligné).
- Raccourci `Ctrl/Cmd+B` pour afficher ou masquer l'explorateur, complété par une icône en haut à gauche de la zone de contenu pour le réafficher quand il est masqué.
- Bouton de fermeture dans l'en-tête de la barre latérale pour la masquer.
- Barre de défilement visible dans l'arborescence lorsque la liste est trop longue.

### Amélioré

- Seuls les fichiers lisibles par l'application (`*.md`, `*.markdown`, `*.mdx`) sont affichés dans l'arborescence, les autres fichiers sont filtrés.

## [2026.08.8] - 2026-08-19

### Amélioré

- README : clarification de la description du projet.

## [2026.08.7] - 2026-08-18

### Ajouté

- Politique de confidentialité (`PRIVACY.md`).

### Corrigé

- Zoom par pincement (pinch-to-zoom) qui agrandissait/réduisait la page sous Linux (WebKitGTK) et Windows (WebView2) : le geste est désormais désactivé.

## [2026.08.6] - 2026-08-14

### Amélioré

- README restructuré et complété : documentation bilingue (anglais/français), stack technique, architecture, démarrage rapide et section releases.

## [2026.08.5] - 2026-08-14

### Corrigé

- Identité du paquet MSIX alignée sur l'identité réservée dans Partner Center (`Martzcode.Markify` et publisher Microsoft) — validation d'acceptation du Microsoft Store.

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
