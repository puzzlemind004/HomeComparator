import { CRITERES } from '../criteres/definition';
import { CHAMPS_STATUT, STATUT_INITIAL } from '../criteres/statut';
import type { Bien } from './bien';
import type { ValeursCriteres } from '../criteres/valeurs';
import type { ValeursChampsStatut } from '../criteres/statut';

/**
 * Un Bien tel que l'adapter en produit : une entrée par Critère de la
 * définition, à `null` sauf indication contraire.
 *
 * Les tests qui portent sur autre chose que les Critères — la liste, la
 * création — n'ont pas à énumérer quinze `null` pour construire un Bien
 * valide, et surtout n'ont pas à être retouchés à chaque Critère ajouté
 * (ADR-0004).
 *
 * Les Critères passés en surcharge complètent cette base plutôt que de la
 * remplacer : un test qui fixe le prix décrit un Bien dont le reste est
 * simplement à renseigner, ce qui est le cas ordinaire.
 */
export function unBien({ criteres, champsStatut, ...surcharges }: Partial<Bien> = {}): Bien {
  return {
    id: 1,
    libelle: 'le T3 avec la terrasse',
    urlAnnonce: null,
    // Rien d'écrit encore : les Notes se prennent à la visite, pas au
    // repérage (#8).
    notes: null,
    // Un Bien qu'on vient de repérer : c'est là que la création le met, et
    // le cas ordinaire des tests qui portent sur autre chose (#7).
    statut: STATUT_INITIAL,
    ...surcharges,
    champsStatut: { ...champsStatutVides(), ...champsStatut },
    criteres: { ...criteresVides(), ...criteres },
  };
}

/** Les quinze Critères de la définition, aucun renseigné. */
export function criteresVides(): ValeursCriteres {
  return Object.fromEntries(CRITERES.map(({ id }) => [id, null]));
}

/** Les champs liés au Statut, aucun renseigné. */
export function champsStatutVides(): ValeursChampsStatut {
  return Object.fromEntries(CHAMPS_STATUT.map(({ id }) => [id, null]));
}
