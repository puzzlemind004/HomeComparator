/**
 * Un seul message pour tous les refus de connexion (#4).
 *
 * La connexion ne passe volontairement par aucun validateur : un champ
 * absent produirait un 422 et un mot de passe erroné un 401, et cet écart
 * de statut renseignerait déjà celui qui cherche à entrer. Le contrôleur
 * ramène tous les cas à une même réponse, portant ce message.
 */
export const MOT_DE_PASSE_REFUSE = 'Mot de passe incorrect'
