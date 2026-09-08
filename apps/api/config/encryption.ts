import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/core/encryption'

/**
 * Le module de chiffrement sert aux cookies et aux URLs signées.
 * Perdre ou changer APP_KEY rend les données chiffrées illisibles.
 */
const encryptionConfig = defineConfig({
  default: 'app',
  list: {
    app: drivers.aes256gcm({
      id: 'app',
      keys: [env.get('APP_KEY')],
    }),
  },
})

export default encryptionConfig
