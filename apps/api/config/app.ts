import env from '#start/env'
import { estAdresseInterne } from '#services/adresses_internes'
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
