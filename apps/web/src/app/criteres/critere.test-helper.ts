import { critereParId } from './definition';
import type { Critere } from './critere';

/**
 * Le Critère de la définition portant cet identifiant.
 *
 * Les tests de comparaison et de formatage travaillent sur les Critères
 * réels plutôt que sur des objets fabriqués : c'est la définition livrée
 * qu'il s'agit de vérifier, et un faux Critère passerait à côté d'une entrée
 * mal déclarée.
 *
 * Un identifiant inconnu lève plutôt que de rendre `undefined` : c'est une
 * erreur d'écriture du test, et elle doit se voir à la ligne fautive.
 */
export function critere(id: string): Critere {
  const trouve = critereParId(id);

  if (!trouve) {
    throw new Error(`Critère inconnu dans la définition : ${id}`);
  }

  return trouve;
}
