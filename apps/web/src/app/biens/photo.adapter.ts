import type { Photo } from './photo';
import type { PhotoApi } from './photo.api';
import { urlPhoto } from './routes';

/**
 * La traduction entre la forme que l'API rend et le modèle que l'écran
 * affiche (ADR-0010).
 *
 * L'adapter compose ici les adresses sous lesquelles la photo se charge, à
 * partir de `routes.ts` qui est le seul endroit à connaître la forme des
 * chemins. L'API ne rend que des noms de fichiers : un `<img>` qui
 * composerait l'adresse lui-même ferait de chaque écran un endroit de plus à
 * corriger le jour où elle changerait.
 */
export function versPhoto(photoApi: PhotoApi): Photo {
  const base = urlPhoto(photoApi.bienId, photoApi.id);

  return {
    id: photoApi.id,
    url: base,
    // La taille en paramètre plutôt qu'en chemin : c'est la même photo, sous
    // deux poids, et l'API la sert sous une seule adresse (#13).
    urlVignette: `${base}?taille=vignette`,
  };
}
