/**
 * Les adresses des écrans du carnet, nommées une seule fois.
 *
 * Elles sont écrites ici et pas seulement dans `app.routes.ts` parce que la
 * navigation les cite aussi, et que ses tests les comparent : deux
 * orthographes qui divergeraient donneraient une entrée de menu qui ne
 * s'allume jamais — un lien qui marche, sous un onglet qui ne se marque pas
 * courant. C'est le même service que `auth.routes.ts` rend à la connexion.
 *
 * Ce sont des adresses d'écrans, pas d'API : celles de l'API sont dans
 * `routes.ts`, et les deux familles n'ont aucune raison de se ressembler.
 */

/** La liste des Biens, écran d'accueil du carnet. */
export const ROUTE_BIENS = '/';

/** Le face-à-face, désormais un écran et non plus une section (#124). */
export const ROUTE_COMPARAISON = '/comparer';

/** L'export du carnet, atteignable depuis n'importe quel écran (#14, #124). */
export const ROUTE_EXPORT = '/exporter';

/** La fiche d'un Bien (#8). */
export function routeFicheBien(bienId: number): string {
  return `/biens/${bienId}`;
}

/**
 * L'écran où s'écrit un Commentaire, celui qu'on ouvre pendant la visite.
 *
 * Un écran à lui et non un formulaire déplié en bas de fiche : le geste se
 * fait debout dans une pièce, l'appareil photo occupe l'écran entier, et
 * revenir de la prise de vue au milieu d'une fiche longue ferait perdre
 * l'endroit où l'on en était. Il se referme sur la fiche une fois le
 * Commentaire ajouté.
 */
export function routeCommenterBien(bienId: number): string {
  return `${routeFicheBien(bienId)}/commenter`;
}
