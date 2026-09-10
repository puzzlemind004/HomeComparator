import { defineConfig, stores } from '@adonisjs/limiter'

/**
 * Le magasin qui compte les tentatives de connexion échouées (#26).
 *
 * PostgreSQL, comme les sessions : il est déjà dans la pile (ADR-0003), et
 * un compteur de force brute ne justifie pas d'y ajouter Redis. Le prix est
 * une écriture par tentative échouée — sur une route qu'un seul acheteur
 * emprunte, c'est sans conséquence.
 *
 * La mémoire aurait suffi à un unique conteneur, mais elle repart à zéro à
 * chaque redémarrage : qui essaie longtemps finirait par tomber sur un
 * déploiement, et le compteur se viderait sans que personne l'ait décidé.
 */
const limiterConfig = defineConfig({
  default: 'database',
  stores: {
    database: stores.database({
      tableName: 'rate_limits',
      // Les clés expirées ne s'effacent pas d'elles-mêmes : sans ce
      // balayage, la table ne fait que croître, une ligne par adresse ayant
      // un jour échoué.
      clearExpiredByTimeout: true,
    }),
  },
})

export default limiterConfig

declare module '@adonisjs/limiter/types' {
  export interface LimitersList extends InferLimiters<typeof limiterConfig> {}
}
