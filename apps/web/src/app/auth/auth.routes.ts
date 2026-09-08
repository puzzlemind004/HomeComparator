/**
 * Les adresses de l'authentification, nommées une seule fois.
 *
 * Le service appelle `SESSION_URL`, l'intercepteur compare la sienne à
 * celle-ci pour ne pas rediriger sur un mot de passe refusé : deux
 * orthographes qui divergeraient enverraient le formulaire de connexion
 * boucler sur lui-même au lieu d'afficher son message.
 */

/** La route de l'API portant la session. */
export const SESSION_URL = '/api/auth/session';

/** L'écran de connexion. */
export const ROUTE_CONNEXION = '/connexion';

/** Le carnet, où l'on retombe une fois connecté. */
export const ROUTE_CARNET = '/';
