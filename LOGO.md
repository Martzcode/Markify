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
5. **Important** : l'icône de la taskbar est *embarquée dans le binaire Rust* à la compilation. Cargo ne détecte pas le changement des fichiers d'icônes, il faut donc forcer la recompilation :

   ```bash
   touch src-tauri/src/lib.rs
   ```

## Vérifier

```bash
npm run tauri:dev
```

Le logo doit apparaître dans la barre de titre et dans la taskbar.

## Cas particulier : Linux / KDE (Wayland)

Sous Wayland, la taskbar ne lit **pas** l'icône de la fenêtre : elle cherche un fichier
`<app-id>.desktop` dans `~/.local/share/applications/` et utilise son champ `Icon=`.
Le `app-id` Wayland est défini par le prgname GLib, fixé dans `src-tauri/src/lib.rs`
(ne pas y toucher, c'est déjà fait).

Pour que l'icône s'affiche en dev, une seule fois par machine :

```bash
# 1. Installer l'icône dans le thème hicolor
mkdir -p ~/.local/share/icons/hicolor/{32x32,128x128,256x256,512x512}/apps
cp src-tauri/icons/32x32.png       ~/.local/share/icons/hicolor/32x32/apps/com.markify.app.png
cp src-tauri/icons/128x128.png     ~/.local/share/icons/hicolor/128x128/apps/com.markify.app.png
cp src-tauri/icons/128x128@2x.png  ~/.local/share/icons/hicolor/256x256/apps/com.markify.app.png
cp src-tauri/icons/icon.png        ~/.local/share/icons/hicolor/512x512/apps/com.markify.app.png

# 2. Créer le fichier .desktop (adaptez le chemin Exec si le projet bouge)
cat > ~/.local/share/applications/com.markify.app.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Markify
Exec=/usr/bin/env npm --prefix /chemin/vers/Markify run tauri:dev
Icon=com.markify.app
Terminal=false
Categories=Office;
StartupWMClass=com.markify.app
EOF

# 3. Rafraîchir les caches KDE
kbuildsycoca6
rm -f ~/.cache/icon-cache.kcache
```

Si l'icône n'apparaît toujours pas, redémarrez plasmashell (ou déconnectez-vous) :
`kquitapp6 plasmashell && plasmashell &`

En production (`.deb`), le paquet installe lui-même le `.desktop` et les icônes,
cette étape n'est nécessaire qu'en développement.

> Note : `enableGTKAppId` dans `tauri.conf.json` ne suffit pas — le prgname est
> défini dans `src-tauri/src/lib.rs` via `gtk::glib::set_prgname`.
