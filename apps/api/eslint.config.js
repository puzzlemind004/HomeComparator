import { configApp } from '@adonisjs/eslint-config'

/**
 * Les fichiers qu'`ace` régénère à chaque commande — `database/schema.ts` au
 * `migration:run`, `.adonisjs/` à toute commande, tests compris — sont hors
 * du lint comme ils sont hors du dépôt (`.gitignore`). Sans cela, lancer les
 * tests suffit à faire échouer `npm run lint` sur du code que personne n'a
 * écrit, et dont la mise en forme n'engage rien.
 */
export default [...configApp(), { ignores: ['.adonisjs/**', 'database/schema.ts'] }]
