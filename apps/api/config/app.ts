import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { Secret } from '@adonisjs/core/helpers'
import { defineConfig } from '@adonisjs/core/http'

/**
 * The app key is used for encrypting cookies, generating signed URLs,
 * and by the "encryption" module.
 *
 * The encryption module will fail to decrypt data if the key is lost or
 * changed. Therefore it is recommended to keep the app key secure.
 */
export const appKey = new Secret(env.get('APP_KEY'))

/**
 * The configuration settings used by the HTTP server
 */
export const http = defineConfig({
  generateRequestId: true,
  allowMethodSpoofing: false,

  /**
   * À qui l'on emprunte l'adresse de l'appelant (#26).
   *
   * L'API tourne derrière nginx, qui la joint par le réseau du conteneur et
   * transmet l'adresse réelle dans `X-Forwarded-For`. Le défaut ne fait
   * confiance qu'à la boucle locale, dont nginx n'arrive pas : sans cette
   * déclaration, `request.ip()` rendrait l'adresse de nginx pour tout le
   * monde, et la limitation « par IP » deviendrait un compteur global que
   * n'importe qui pourrait épuiser pour verrouiller le propriétaire.
   *
   * La confiance s'arrête au réseau interne. L'étendre à tous annulerait la
   * limitation plutôt que de la corriger : l'en-tête se forge à volonté, et
   * chaque tentative s'attribuerait une adresse neuve.
   *
   * `proxy-addr` remonte la chaîne de droite à gauche et s'arrête au
   * premier maillon non fiable. Ce qu'un client déclare de lui-même se
   * retrouve donc à gauche de ce que nginx a ajouté, et n'est jamais
   * retenu — c'est ce qui rend le compteur incontournable.
   */
  trustProxy: estAdresseInterne,

  /**
   * Enabling async local storage will let you access HTTP context
   * from anywhere inside your application.
   */
  useAsyncLocalStorage: false,

  /**
   * Manage cookies configuration. The settings for the session id cookie are
   * defined inside the "config/session.ts" file.
   */
  cookie: {
    domain: '',
    path: '/',
    maxAge: '2h',
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax',
  },
})

/**
 * Les adresses d'où l'API accepte qu'on lui annonce l'appelant : la boucle
 * locale et les trois plages privées d'IPv4, plus leurs équivalents IPv6.
 * C'est de là, et de nulle part ailleurs, que nginx la joint.
 *
 * Écrit à la main plutôt que délégué aux noms de plages de `proxy-addr` :
 * le paquet est une dépendance indirecte, sans types, et l'ajouter aux
 * dépendances directes pour trois expressions régulières coûterait plus que
 * de les lire ici.
 */
const ADRESSES_INTERNES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  // 172.16.0.0/12, soit 172.16 à 172.31 — et non tout 172.
  /^172\.(1[6-9]|2\d|3[01])\./,
]

export function estAdresseInterne(adresse: string): boolean {
  // Node préfixe les adresses IPv4 reçues sur une pile double : `::ffff:` ne
  // doit pas empêcher de reconnaître une adresse privée.
  const nue = adresse.replace(/^::ffff:/i, '')

  // `::1` est la boucle locale IPv6 ; `fc00::/7` (fc/fd) et `fe80::/10`
  // (fe8 à feb) en sont les plages internes.
  if (/^(::1|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(nue)) {
    return true
  }

  return ADRESSES_INTERNES.some((plage) => plage.test(nue))
}
