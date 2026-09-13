import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Bien from '#models/bien'
import Photo from '#models/photo'
import {
  champsDuCsv,
  exporterCarnet,
  formatDemande,
  nomDuFichier,
  versCsv,
} from '#services/export_donnees'

/**
 * L'export des données du carnet (#14).
 *
 * Tout est saisi à la main (ADR-0001), et trois mois de recherche perdus
 * videraient le carnet de son intérêt. L'export répond à deux besoins d'un
 * coup : manipuler ses Biens dans un tableur, et ne pas se sentir prisonnier
 * de l'outil (ADR-0007). Il est la moitié « à la demande » du dispositif de
 * sauvegarde, l'autre étant le `pg_dump` quotidien de la pile (#71).
 *
 * La route est dans le groupe authentifié comme tout le reste (ADR-0011), et
 * c'est ici que cela compte le plus : une adresse qui rend le carnet entier
 * en un seul appel est ce que l'API a de plus sensible.
 *
 * Le contrôleur ne sait rien du format : il rassemble les Biens et leurs
 * Photos, et confie la mise en forme au service. C'est ce qui permet de
 * décrire l'échappement CSV et le BOM sans monter de serveur.
 */
export default class ExportController {
  async handle({ request, response }: HttpContext) {
    const format = formatDemande(request.input('format'))

    /**
     * Tout le carnet, Notes comprises — à la différence de la liste, qui ne
     * les rapatrie pas (#8). Ici elles sont précisément ce qu'on vient
     * chercher : c'est la copie que l'acheteur emporte.
     *
     * L'ordre est celui de la liste, du plus récemment repéré au plus
     * ancien. Sans tri explicite, deux exports successifs ne se
     * compareraient plus d'un jour à l'autre.
     */
    const biens = await Bien.query().orderBy('created_at', 'desc').orderBy('id', 'desc')

    const carnet = exporterCarnet(biens, await photosParBien(biens), DateTime.utc().toISO())

    /**
     * Le jour, et non l'instant : c'est ce qui nomme le fichier, et une
     * heure dans un nom de téléchargement ne sert qu'à le rendre illisible.
     * L'horodatage complet est dans le contenu.
     */
    const jour = DateTime.utc().toISODate()

    /**
     * `attachment` : le fichier se télécharge plutôt que de s'afficher dans
     * l'onglet. Un JSON affiché serait à copier-coller à la main, ce qui est
     * exactement le geste que l'export existe pour éviter.
     */
    response.header('content-disposition', `attachment; filename="${nomDuFichier(format, jour)}"`)

    if (format === 'csv') {
      /**
       * Le jeu de caractères est annoncé dans l'en-tête **et** porté par le
       * BOM que le service écrit. Les deux se justifient : l'en-tête sert au
       * navigateur qui reçoit la réponse, le BOM sert au tableur qui ouvre
       * le fichier plus tard, une fois l'en-tête HTTP oublié depuis
       * longtemps.
       */
      response.header('content-type', 'text/csv; charset=utf-8')

      return response.send(versCsv(carnet, champsDuCsv(carnet)))
    }

    return response.json(carnet)
  }
}

/**
 * Les Photos de chaque Bien, dans l'ordre de la galerie (#13).
 *
 * Une seule requête pour tout le carnet, et non une par Bien : l'export est
 * déjà l'appel le plus lourd de l'API, et autant d'allers-retours à la base
 * que de Biens coûteraient plus que tout le reste réuni. C'est le même
 * raisonnement que la photo représentative de la liste.
 *
 * Toutes les Photos, et non la seule représentative : l'export est la copie
 * complète du carnet, et une galerie réduite à sa première vignette ne
 * dirait pas ce que l'acheteur possède. Ce sont des noms de fichiers, pas
 * des octets (ADR-0014) — le poids reste négligeable.
 */
async function photosParBien(biens: Bien[]): Promise<Map<number, Photo[]>> {
  const parBien = new Map<number, Photo[]>()

  if (biens.length === 0) {
    return parBien
  }

  /**
   * L'ordre de la galerie vient de `Photo.ordreGalerie` et n'est pas
   * réécrit ici : c'est une propriété des photos et non de l'écran qui les
   * demande, et l'export doit les rendre dans le même ordre que la galerie.
   * Réécrire les deux clauses les ferait diverger en silence le jour où cet
   * ordre change.
   *
   * `bien_id` reste en tête, et lui seul appartient à cet appel : il groupe
   * les galeries entre elles, là où `ordreGalerie` range l'intérieur de
   * chacune.
   */
  const photos = await Photo.ordreGalerie(
    Photo.query()
      .whereIn(
        'bien_id',
        biens.map(({ id }) => id)
      )
      .orderBy('bien_id', 'asc')
  )

  for (const photo of photos) {
    const galerie = parBien.get(photo.bienId)

    if (galerie) {
      galerie.push(photo)
    } else {
      parBien.set(photo.bienId, [photo])
    }
  }

  return parBien
}
