import env from '#start/env'
import { defineConfig } from '@adonisjs/cors'

/**
 * Le front est servi depuis une autre origine que l'API en développement.
 * En production, les deux sont derrière le même nom de domaine, mais
 * l'origine reste explicitement déclarée plutôt que laissée à `true`.
 */
const corsConfig = defineConfig({
  enabled: true,
  origin: env
    .get('CORS_ORIGIN')
    .split(',')
    .map((origin) => origin.trim()),
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
