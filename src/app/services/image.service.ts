import { Injectable } from '@angular/core';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { readImage } from '@tauri-apps/plugin-clipboard-manager';
import { resolveLocalImagePath } from '../utils/image-path';

export interface ClipboardImage {
  bytes: Uint8Array;
  fileName: string;
}

const EXTERNAL_SOURCE = /^(https?:|data:|blob:)/i;
const ASSET_SOURCE = /^(asset:|https?:\/\/asset\.localhost)/i;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Encode des octets en base64 pour les commandes Rust. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

/** Convertit les pixels RGBA du presse-papiers en PNG. */
async function rgbaToPng(rgba: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('PNG encoding failed');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Résolution et enregistrement des images locales (F-11).
 *
 * L'aperçu n'accepte que les images situées dans le dossier du document : un
 * Markdown non fiable ne peut donc pas afficher un fichier arbitraire via le
 * protocole `asset:`. Les images sont copiées dans `./assets` à côté du
 * document par les commandes Rust.
 */
@Injectable({ providedIn: 'root' })
export class ImageService {
  /**
   * Transforme une source d'image Markdown en URL affichable. Les URL distantes
   * et les data-URL restent inchangées ; les chemins locaux sont convertis en
   * URL `asset:` uniquement s'ils restent dans le dossier du document.
   */
  previewSrc(src: string, documentPath: string | null): string | null {
    const value = src.trim();
    if (!value) {
      return null;
    }
    // Une URL `asset:` écrite dans le Markdown contournerait le contrôle de
    // dossier : on la refuse avant toute autre vérification.
    if (ASSET_SOURCE.test(value)) {
      return null;
    }
    if (EXTERNAL_SOURCE.test(value)) {
      return value;
    }
    if (URL_SCHEME.test(value) && !/^[A-Za-z]:[\\/]/.test(value) && !/^file:/i.test(value)) {
      return null;
    }
    if (!documentPath) {
      return src;
    }
    const path = resolveLocalImagePath(value, documentPath);
    return path ? convertFileSrc(path) : null;
  }

  /** Enregistre des octets d'image et retourne le lien Markdown relatif. */
  saveImage(bytes: Uint8Array, fileName: string, documentPath: string): Promise<string> {
    return invoke<string>('save_image', {
      documentPath,
      fileName,
      data: toBase64(bytes),
    });
  }

  /** Copie un fichier image existant et retourne le lien Markdown relatif. */
  saveImageFromPath(sourcePath: string, documentPath: string): Promise<string> {
    return invoke<string>('save_image_from_path', { documentPath, sourcePath });
  }

  /**
   * Lit une image depuis le presse-papiers et l'encode en PNG. Retourne `null`
   * lorsque le presse-papiers ne contient pas d'image (ou hors Tauri).
   */
  async readClipboardImage(): Promise<ClipboardImage | null> {
    let image: Awaited<ReturnType<typeof readImage>>;
    try {
      image = await readImage();
    } catch {
      return null;
    }
    if (!image) {
      return null;
    }
    try {
      const [{ width, height }, rgba] = await Promise.all([image.size(), image.rgba()]);
      if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
        return null;
      }
      const bytes = await rgbaToPng(rgba, width, height);
      return { bytes, fileName: `image-${Date.now()}.png` };
    } catch {
      return null;
    } finally {
      try {
        await image.close();
      } catch {
        // La fermeture de la ressource est au mieux.
      }
    }
  }
}
