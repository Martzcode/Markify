# Remplacer le logo

Il y a deux endroits où le logo est utilisé :

| Endroit | Fichier | Rôle |
| --- | --- | --- |
| Barre de titre | `public/app-icon.png` | Icône affichée à gauche de « Markify » dans la barre de titre personnalisée |
| Icons de l'application | `src-tauri/icons/` | Icône du gestionnaire de fenêtres / taskbar, utilisée pour les paquets (`.deb`, `.AppImage`, etc.) |
| Favicon dev | `public/favicon.ico` | Visible uniquement en développement dans le navigateur |

## Procédure

1. Placez votre logo en PNG carré (ex. 1024×1024) dans le projet.
2. Régénérez toutes les icônes Tauri à partir de ce fichier :

   ```bash
   npx tauri icon <votre-logo.png>
   ```

   Tauri régénère tout `src-tauri/icons/` (icônes 32×32, 128×128, .ico, .icns, etc.).

3. Copiez la nouvelle icône pour la barre de titre :

   ```bash
   cp src-tauri/icons/32x32.png public/app-icon.png
   ```

4. (Optionnel) Remplacez aussi `public/favicon.ico` si vous voulez un favicon en dev.

## Vérifier

```bash
npm run tauri:dev
```

Le logo doit apparaître dans la barre de titre et dans la taskbar.
