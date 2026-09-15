import { formaterMontant } from './formatage';
import { CHAMPS_STATUT, estPertinent, type ChampStatut, type ValeursChampsStatut } from './statut';
import { estRenseigne } from './valeurs';
import type { ValeurCritere } from './comparaison';

/**
 * Où en est un Bien dans le temps : la date de visite, le montant de la
 * dernière offre — ce que le Statut seul ne dit pas (#120).
 *
 * Le Statut dit l'étape ; il ne dit pas *quand*. « À visiter » ne distingue
 * pas le Bien qu'on voit demain de celui dont le rendez-vous n'est pas pris,
 * et c'est précisément la différence qui décide de ce qu'on fait ce soir.
 * Cette phrase est ce qui rend la distinction lisible dans une liste, sans
 * ouvrir chaque fiche pour retrouver une date que la base porte déjà.
 *
 * Elle vit ici et non dans la carte : le tableau desktop la voudra aussi, et
 * les deux présentations montrent les mêmes Biens (ADR-0006). Écrite deux
 * fois, elle aurait divergé au premier champ ajouté à `CHAMPS_STATUT`.
 *
 * Le module ne dépend pas d'Angular et ne fait aucune entrée-sortie, comme
 * ses voisins de `criteres/` : « ce qu'un Bien porte à cette étape » se
 * vérifie sans monter d'écran.
 */

/**
 * Comment le champ s'annonce dans la phrase, quand il porte une valeur.
 *
 * L'intitulé du champ ne convient pas : `CHAMPS_STATUT` déclare « Date de
 * visite » et « Montant de la dernière offre », qui sont les libellés d'un
 * formulaire. Dans une liste, on écrit « visite le 21/09 » et « offre à
 * 258 000 € » — la phrase d'un carnet, pas l'étiquette d'un champ.
 *
 * La table est indexée par identifiant de champ plutôt que déclarée dans
 * `CHAMPS_STATUT` : c'est une tournure d'affichage, et la déclaration d'un
 * champ n'a pas à porter la façon dont une liste en parle.
 */
const TOURNURES: Readonly<Record<string, (texte: string) => string>> = {
  dateVisite: (texte) => `visite le ${texte}`,
  montantDerniereOffre: (texte) => `offre à ${texte}`,
};

/**
 * Le jour et le mois, et l'année seulement quand ce n'est pas celle en cours.
 *
 * « visite le 21/09 » suffit pour un rendez-vous de la semaine, et c'est ce
 * que la maquette écrit : l'année est du bruit dans une liste où tout se
 * passe dans les mois qui viennent. Elle revient dès qu'elle apprend quelque
 * chose — une visite reportée à janvier prochain se lirait sinon « 12/01 »
 * sans qu'on sache de quel janvier il s'agit.
 *
 * C'est une écriture propre aux listes et non un format du carnet : la fiche
 * garde la date entière, que `formaterDate` rend.
 */
function ecrireDate(date: Date): string {
  const jour = `${date.getDate()}`.padStart(2, '0');
  const mois = `${date.getMonth() + 1}`.padStart(2, '0');
  const annee = date.getFullYear();

  return annee === new Date().getFullYear() ? `${jour}/${mois}` : `${jour}/${mois}/${annee}`;
}

/** La valeur écrite, selon ce que le champ déclare porter. */
function ecrire(champ: ChampStatut, valeur: ValeurCritere): string {
  if (champ.type === 'date') {
    // Les dates voyagent en texte ISO depuis l'API : un `Date` se construit
    // ici plutôt que dans l'adapter, qui rend les champs liés au Statut tels
    // qu'il les reçoit. Une date illisible rend la chaîne vide plutôt que
    // « Invalid Date » — la phrase ne s'ouvre alors pas du tout.
    if (typeof valeur !== 'string') {
      return '';
    }

    const date = new Date(valeur);

    return Number.isNaN(date.getTime()) ? '' : ecrireDate(date);
  }

  return typeof valeur === 'number' ? formaterMontant(valeur) : '';
}

/**
 * Ce que ce Bien porte à son étape, ou la chaîne vide quand il n'y a rien à
 * en dire.
 *
 * Le champ retenu est **le plus avancé** de ceux que le Statut rend
 * pertinents (ADR-0002) et qui porte une valeur : un Bien sur lequel une
 * offre a été faite se résume par son offre, pas par la date de la visite
 * qui l'a précédée. C'est l'ordre de `CHAMPS_STATUT` qui en décide, comme
 * pour tout le reste du cycle.
 *
 * La chaîne vide est un cas ordinaire et non un défaut : un Bien qu'on vient
 * de repérer n'a ni visite ni offre, et c'est l'état dans lequel il passe le
 * plus clair de son temps. C'est à l'écran de ne rien afficher plutôt que
 * d'afficher un vide.
 */
export function situation(statut: string, valeurs: ValeursChampsStatut): string {
  // Parcouru à l'envers : le dernier champ pertinent qui porte une valeur est
  // le plus avancé dans le cycle, et c'est celui qui résume le Bien.
  const champs = [...CHAMPS_STATUT].reverse();

  for (const champ of champs) {
    if (!estPertinent(champ, statut)) {
      continue;
    }

    const valeur = valeurs[champ.id];

    if (!estRenseigne(valeur)) {
      continue;
    }

    const texte = ecrire(champ, valeur);

    // Une valeur que le format refuse — une date illisible, un montant arrivé
    // en texte — ne produit pas « visite le  » : mieux vaut ne rien dire que
    // d'annoncer une étape sans pouvoir la situer.
    if (texte) {
      return TOURNURES[champ.id]?.(texte) ?? texte;
    }
  }

  return '';
}
