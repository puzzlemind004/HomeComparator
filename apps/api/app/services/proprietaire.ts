/**
 * Le propriétaire des Biens (#4).
 *
 * L'outil n'a qu'un utilisateur et n'offre aucune gestion de comptes : tous
 * les Biens portent donc cette même valeur. Elle n'est pas une donnée saisie
 * ni une clé vers une table — il n'y en a pas —, mais le repère qui rendra
 * indolore un éventuel passage au multi-utilisateurs, où rattacher après coup
 * des données existantes à des propriétaires serait le vrai coût.
 */
export const PROPRIETAIRE_UNIQUE = 'proprietaire-unique'
