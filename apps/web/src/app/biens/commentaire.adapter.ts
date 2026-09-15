import type { Commentaire } from './commentaire';
import type { CommentaireApi } from './commentaire.api';
import { versPhoto } from './photo.adapter';
import { formaterMoment } from '../criteres/formatage';

/**
 * La traduction entre la forme que l'API rend et le modèle que l'écran
 * affiche (ADR-0010).
 *
 * L'adapter laisse tomber ce que rien ne montre — `bienId`, `photoId`,
 * `updatedAt` —, compose les adresses de la photo en déléguant à l'adapter
 * des photos, et écrit la date pour être lue. Un gabarit qui ferait ces
 * trois choses lui-même les referait sur chaque écran qui affiche un
 * Commentaire.
 */
export function versCommentaire(commentaireApi: CommentaireApi): Commentaire {
  const photo = commentaireApi.photo ? versPhoto(commentaireApi.photo) : null;

  return {
    id: commentaireApi.id,
    texte: commentaireApi.texte,
    photo: photo ? { url: photo.url, urlVignette: photo.urlVignette } : null,
    note: commentaireApi.note,
    date: formaterMoment(new Date(commentaireApi.createdAt)),
  };
}
