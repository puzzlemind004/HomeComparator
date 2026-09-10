/**
 * Les adresses d'où l'API accepte qu'on lui annonce l'appelant (#26).
 *
 * `config/app.ts` s'en sert pour décider à quel proxy faire confiance, et
 * c'est tout ce qui rend le comptage des tentatives de connexion réellement
 * « par adresse » : mal réglée, la limitation devient un compteur global
 * que n'importe qui peut épuiser, ou se contourne à chaque tentative.
 *
 * Ce module vit ici plutôt que dans la configuration : c'est une règle, pas
 * un réglage, et c'est à ce titre qu'il s'éprouve dans les tests.
 */

/**
 * La boucle locale et les trois plages privées d'IPv4 — les seules d'où
 * nginx joint l'API, que ce soit par le réseau du conteneur ou depuis
 * l'hôte.
 *
 * Écrites ici plutôt que déléguées aux noms de plages de `proxy-addr` : le
 * paquet n'est pas une dépendance déclarée de l'API, seulement une
 * dépendance du serveur HTTP qui l'utilise, et il ne porte pas ses types.
 * L'ajouter pour ces quatre plages coûterait un paquet et une déclaration
 * de types ; les lire ici les met sous le regard des tests, qui en fixent
 * les bornes.
 */
const PLAGES_INTERNES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  // 172.16.0.0/12, soit 172.16 à 172.31 — et non tout 172.
  /^172\.(1[6-9]|2\d|3[01])\./,
  // 169.254.0.0/16, l'auto-configuration : une machine qui n'a pas obtenu
  // d'adresse reste sur le lien local, elle n'est pas sur Internet.
  /^169\.254\./,
]

/**
 * `::1` est la boucle locale IPv6 ; `fc00::/7` (fc et fd) les adresses
 * uniques locales, et `fe80::/10` (fe8 à feb) le lien local.
 *
 * Le groupe de tête peut être abrégé — `fc::1` est une adresse unique
 * locale valable au même titre que `fc00::1` — d'où les chiffres
 * facultatifs plutôt qu'un groupe de quatre exigé.
 */
const PLAGES_INTERNES_IPV6 = /^(::1$|::1[^0-9a-f]|f[cd][0-9a-f]{0,2}:|fe[89ab][0-9a-f]{0,1}:)/i

/** L'adresse est-elle de celles à qui l'on emprunte l'identité de l'appelant ? */
export function estAdresseInterne(adresse: string): boolean {
  // Node préfixe les adresses IPv4 reçues sur une pile double : `::ffff:`
  // ne doit pas empêcher de reconnaître une adresse privée.
  const nue = adresse.replace(/^::ffff:/i, '')

  if (PLAGES_INTERNES_IPV6.test(nue)) {
    return true
  }

  return PLAGES_INTERNES.some((plage) => plage.test(nue))
}
