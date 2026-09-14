import { defineConfig } from '@adonisjs/core/bodyparser'
import string from '@adonisjs/core/helpers/string'
import env from '#start/env'

/**
 * Le préfixe que portent les temporaires d'envoi **pendant les tests seuls**
 * (#99).
 *
 * Le dossier temporaire du système est partagé : sur l'exécuteur GitHub,
 * `runc` y crée et y supprime ses propres fichiers pendant que les tests
 * tournent. Les tests des photos vérifient qu'aucun original n'y survit
 * (ADR-0014) en comparant un avant et un après ; sans marque distinguant les
 * nôtres, ils comptaient ceux des autres et échouaient au hasard — ce qui,
 * sur le chemin du déploiement, coûte un numéro de version à chaque fois.
 *
 * Le préfixe ne s'applique qu'à `NODE_ENV=test`, que le lanceur de tests
 * pose. En production le nom reste l'UUID nu que le bodyparser génère de
 * lui-même : `tmpFileName` n'y est pas appelé du tout.
 */
export const PREFIXE_TEMPORAIRE_ENVOI = 'homecomparator-envoi-'

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
     * Elle ne touche que le `multipart/form-data`, donc la seule route qui
     * reçoit des fichiers : le JSON du reste du carnet garde sa propre
     * limite, plus basse, juste au-dessus.
     *
     * `client_max_body_size` de nginx est réglé en conséquence, et **sur la
     * seule route des photos** (`apps/web/nginx.conf`) : le plus bas des deux
     * décide, et un 413 de nginx arriverait sans le message de l'API nommant
     * le fichier en cause.
     */
    limit: '60mb',
    types: ['multipart/form-data'],

    /**
     * Le nom des temporaires d'envoi, **en test uniquement** (#99).
     *
     * Hors test, la clé vaut `undefined` : le bodyparser reprend alors sa
     * branche par défaut — `join(tmpdir(), string.uuid())` — et le nommage
     * en production est inchangé, au caractère près.
     *
     * En test, le même UUID est simplement précédé du préfixe : l'unicité
     * qui fait la sûreté du nom reste celle de l'UUID, et le préfixe n'y
     * ajoute qu'une marque à laquelle les tests peuvent se fier.
     */
    tmpFileName:
      env.get('NODE_ENV') === 'test'
        ? () => `${PREFIXE_TEMPORAIRE_ENVOI}${string.uuid()}`
        : undefined,
  },
})

export default bodyParserConfig
