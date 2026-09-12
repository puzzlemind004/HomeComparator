/**
 * Les adresses de l'API, composées ici et nulle part ailleurs.
 *
 * Le front et l'API ne partagent aucune source (ADR-0010) : la forme des
 * chemins est une convention que rien ne vérifie à la compilation, et
 * l'écrire à plusieurs endroits, c'est se donner autant de lignes à corriger
 * le jour où elle change — sans que le compilateur en signale une seule.
 *
 * Le préfixe `/api` est celui que nginx détourne vers l'API en production, et
 * le proxy de développement en local (`proxy.conf.json`).
 */
const BIENS = '/api/biens';

/** L'export du carnet, en JSON ou en CSV (#14). */
const EXPORT = '/api/export';

/** La liste des Biens, et la racine sous laquelle chacun se trouve. */
export function urlBiens(): string {
  return BIENS;
}

/** Un Bien précis : sa fiche, sa modification, sa suppression. */
export function urlBien(bienId: number): string {
  return `${BIENS}/${bienId}`;
}

/** La galerie d'un Bien : ses photos, et l'ajout d'une série (#13). */
export function urlPhotos(bienId: number): string {
  return `${urlBien(bienId)}/photos`;
}

/**
 * Une photo précise : son fichier, ou sa suppression.
 *
 * C'est la version consultable qui se sert sous cette adresse ; la vignette
 * s'obtient en y ajoutant `?taille=vignette`. Une seule adresse pour les deux
 * poids, parce que c'est la même photo (#13).
 */
export function urlPhoto(bienId: number, photoId: number): string {
  return `${urlPhotos(bienId)}/${photoId}`;
}

/**
 * L'export du carnet, dans le format demandé (#14).
 *
 * Le format est un paramètre et non une seconde adresse : c'est un bouton à
 * deux choix côté écran, et la ressource est la même — le carnet entier.
 */
export function urlExport(format: 'json' | 'csv'): string {
  return `${EXPORT}?format=${format}`;
}
