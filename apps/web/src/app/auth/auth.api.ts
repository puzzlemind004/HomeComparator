/**
 * Les formes échangées avec l'API pour l'accès à l'outil, telles qu'elle les
 * envoie et les attend (ADR-0010).
 *
 * Ces types décrivent le contrat HTTP, pas ce que l'écran affiche : ils
 * restent confinés au service, seul à les connaître.
 */

/** L'état de session que l'API rapporte, et qu'elle confirme à la connexion. */
export interface SessionApi {
  authentifie: boolean;
}

/** Ce que l'API attend pour ouvrir une session : le mot de passe, et rien d'autre. */
export interface ConnexionApi {
  motDePasse: string;
}

/**
 * Le refus d'une connexion. L'API rédige le message pour être lu tel quel,
 * et le rend identique quelle que soit la cause du refus.
 */
export interface RefusApi {
  message: string;
}
