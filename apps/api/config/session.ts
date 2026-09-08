import app from '@adonisjs/core/services/app'
import { defineConfig, stores } from '@adonisjs/session'

/**
 * La session porte la seule chose que l'application ait besoin de retenir
 * d'une visite à l'autre : que le mot de passe unique a été donné (#4).
 *
 * Le magasin est la base, et non le cookie. Un magasin cookie aurait suffi à
 * porter ce booléen, mais il rend la déconnexion illusoire : rien n'existant
 * côté serveur, un cookie recopié avant la déconnexion continue d'ouvrir la
 * session. Une ligne en base se supprime, elle. PostgreSQL est déjà dans la
 * pile (ADR-0003), donc cela ne coûte qu'une table.
 */
const sessionConfig = defineConfig({
  enabled: true,
  cookieName: 'homecomparator_session',

  /**
   * Trente jours : l'acheteur revient sur son carnet au fil des semaines
   * d'une recherche immobilière, et se reconnecter à chaque consultation
   * n'apporte rien face au seul risque réel, un appareil personnel perdu.
   */
  age: '30 days',

  /**
   * Un seul mot de passe protège tout l'outil : le cookie qui atteste de la
   * session ne doit jamais être lisible par du script, ni partir en clair.
   * `secure` suit l'environnement — en développement le front est servi en
   * http, et un cookie `secure` ne serait jamais renvoyé.
   */
  cookie: {
    path: '/',
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax',
  },

  store: 'database',
  stores: {
    database: stores.database({ tableName: 'sessions' }),
  },
})

export default sessionConfig
