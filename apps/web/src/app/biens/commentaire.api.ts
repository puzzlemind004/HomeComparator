import type { PhotoApi } from './photo.api';

/**
 * Un Commentaire tel que l'API le renvoie.
 *
 * Cette forme décrit le contrat HTTP et non ce que l'écran affiche : elle
 * reste confinée au service et à l'adapter, qui la traduisent vers le modèle
 * d'affichage de `commentaire.ts` (ADR-0010).
 *
 * La photo y voyage entière plutôt que par son seul identifiant : l'adapter a
 * besoin du `bienId` qu'elle porte pour composer les adresses, et une requête
 * par vignette ferait autant d'allers-retours que de Commentaires.
 */
export interface CommentaireApi {
  id: number;
  bienId: number;
  texte: string | null;
  photoId: number | null;
  photo: PhotoApi | null;
  note: number | null;
  createdAt: string;
  updatedAt: string;
}
