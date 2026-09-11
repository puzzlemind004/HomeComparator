import { defineConfig } from '@adonisjs/core/bodyparser'

const bodyParserConfig = defineConfig({
  /**
   * The bodyparser middleware will parse the request body
   * for the following HTTP methods.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Config for the "application/x-www-form-urlencoded"
   * content-type parser
   */
  form: {
    convertEmptyStringsToNull: true,
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * Config for the JSON parser
   */
  json: {
    convertEmptyStringsToNull: true,
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /**
   * Config for the "multipart/form-data" content-type parser.
   * File uploads are handled by the multipart parser.
   */
  multipart: {
    /**
     * Enabling auto process allows bodyparser middleware to
     * move all uploaded files inside the tmp folder of your
     * operating system
     */
    autoProcess: true,
    convertEmptyStringsToNull: true,
    processManually: [],

    /**
     * La taille totale d'un envoi, toutes photos confondues (#13).
     *
     * Elle est distincte de la limite **par photo** (`TAILLE_MAX_MO`, 10 Mo),
     * que le contrôleur applique et dont il rend un message nommant le
     * fichier en cause. Celle-ci ne borne que ce que l'API accepte de lire
     * d'un coup : trop basse, elle couperait un envoi multiple — la série
     * qu'on prend pendant une visite — avant que le contrôleur n'ait de quoi
     * dire pourquoi.
     *
     * `client_max_body_size` de nginx est réglé en conséquence
     * (`apps/web/nginx.conf`) : le plus bas des deux décide, et un 413 de
     * nginx arriverait sans le message de l'API.
     */
    limit: '60mb',
    types: ['multipart/form-data'],
  },
})

export default bodyParserConfig
