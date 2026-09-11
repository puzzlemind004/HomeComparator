import type { Photo } from './photo';
import type { PhotoApi } from './photo.api';

/**
 * La traduction entre la forme que l'API rend et le modèle que l'écran
 * affiche (ADR-0010).
 *
 * C'est ici que se compose l'adresse du fichier, et nulle part ailleurs :
 * l'API ne rend que des noms de fichiers, et la route qui les sert est une
 * affaire de contrat HTTP. Un `<img>` qui la composerait lui-même ferait de
 * chaque écran un endroit de plus à corriger si elle changeait.
 */
export function versPhoto(photoApi: PhotoApi): Photo {
  const base = `/api/biens/${photoApi.bienId}/photos/${photoApi.id}`;

  return {
    id: photoApi.id,
    url: base,
    // La taille en paramètre plutôt qu'en chemin : c'est la même photo, sous
    // deux poids, et l'API la sert sous une seule adresse (#13).
    urlVignette: `${base}?taille=vignette`,
  };
}
