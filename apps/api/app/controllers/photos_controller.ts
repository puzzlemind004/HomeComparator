import type { HttpContext } from '@adonisjs/core/http'
import Bien from '#models/bien'
import Photo from '#models/photo'
import {
  TAILLE_MAX_MO,
  TYPES_ACCEPTES,
  cheminPhoto,
  effacerPhoto,
  enregistrerPhoto,
} from '#services/stockage_photos'

/**
 * Les photos d'un Bien (#13).
 *
 * C'est la fonctionnalité qui répond le plus directement au problème
 * d'origine : dans un mois, « le T3 rue Victor Hugo » n'évoquera plus rien
 * sans image. L'ajout depuis un téléphone pendant une visite est le cas
 * d'usage principal et non un bonus — d'où l'envoi multiple, qui évite de
 * répéter le geste photo par photo debout dans un couloir.
 *
 * Les fichiers sont servis par l'API et non par nginx : ils doivent être
 * derrière la session comme le reste du carnet (ADR-0011), et un dossier
 * exposé en statique le serait pour qui en devine le nom.
 */
export default class PhotosController {
  /** Les photos d'un Bien, dans l'ordre de la galerie. */
  async index({ params, response }: HttpContext) {
    const bien = await Bien.find(params.bienId)

    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    const photos = await photosDuBien(bien.id)

    return response.ok(photos)
  }

  /**
   * L'ajout de photos à un Bien, une ou plusieurs à la fois.
   *
   * Le pluriel n'est pas une commodité : pendant une visite on prend une
   * série, et la boîte de sélection d'un téléphone permet d'en cocher
   * plusieurs. Exiger un appel par photo ferait répéter le geste autant de
   * fois qu'il y a de pièces.
   */
  async store({ params, request, response }: HttpContext) {
    const bien = await Bien.find(params.bienId)

    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    /**
     * `photos` au pluriel, y compris pour un envoi unique : une seule forme
     * de requête à produire côté écran, et une seule à lire ici.
     */
    const envois = request.files('photos', {
      size: `${TAILLE_MAX_MO}mb`,
      extnames: [...TYPES_ACCEPTES],
    })

    if (envois.length === 0) {
      return response.unprocessableEntity({
        errors: [
          {
            field: 'photos',
            rule: 'required',
            message: 'Aucune photo à ajouter',
          },
        ],
      })
    }

    /**
     * Un seul envoi refusé fait refuser tout le lot, **avant** d'en écrire
     * aucun. Accepter les valides et taire les autres laisserait l'acheteur
     * croire que ses huit photos sont passées alors qu'il en manque deux,
     * et il n'aurait aucun moyen de savoir lesquelles — c'est très
     * exactement ce qu'on ne peut pas se permettre sur des photos de visite
     * qu'on ne repassera pas prendre.
     */
    const refuses = envois.filter((envoi) => !envoi.isValid)

    if (refuses.length > 0) {
      return response.unprocessableEntity({
        errors: refuses.map((envoi) => ({
          field: 'photos',
          rule: envoi.errors[0]?.type ?? 'invalid',
          message: messageRefus(envoi.clientName, envoi.errors[0]?.type),
        })),
      })
    }

    /**
     * Le rang reprend après la dernière photo déjà là : un second envoi se
     * range à la suite du premier plutôt que de se mêler à lui.
     */
    const dernier = await Photo.query().where('bien_id', bien.id).orderBy('rang', 'desc').first()
    let rang = (dernier?.rang ?? -1) + 1

    const ajoutees: Photo[] = []

    for (const envoi of envois) {
      /**
       * `tmpPath` est le fichier que le bodyparser a déjà posé sur le
       * disque temporaire ; `sharp` le relit pour en tirer les deux
       * versions. Ce temporaire est nettoyé par le système, et il n'a
       * jamais à rejoindre le volume — c'est l'original, que rien
       * n'affiche.
       */
      const fichiers = await enregistrerPhoto(envoi.tmpPath!)

      ajoutees.push(
        await Photo.create({
          bienId: bien.id,
          fichier: fichiers.fichier,
          fichierVignette: fichiers.fichierVignette,
          rang: rang++,
        })
      )
    }

    return response.created(ajoutees)
  }

  /**
   * Le fichier d'une photo, servi par l'API.
   *
   * Deux tailles sous la même adresse, que `?taille=vignette` départage :
   * la galerie veut la version consultable, la liste et les cartes la
   * vignette. Deux routes distinctes auraient dit la même chose en
   * dupliquant la recherche du Bien et le contrôle de session.
   */
  async show({ params, request, response }: HttpContext) {
    const photo = await Photo.query().where('id', params.id).where('bien_id', params.bienId).first()

    if (!photo) {
      return response.notFound({ message: "Cette photo n'existe pas" })
    }

    const vignette = request.input('taille') === 'vignette'
    const fichier = vignette ? photo.fichierVignette : photo.fichier

    /**
     * Les photos sont **privées** : elles ne se mettent en cache que dans
     * le navigateur qui les a demandées, jamais dans un proxy partagé. Le
     * nom de fichier étant tiré au sort et le contenu ne changeant jamais,
     * l'immutabilité est acquise — un an de cache épargne autant d'allers-
     * retours sur une connexion mobile.
     */
    response.header('Cache-Control', 'private, max-age=31536000, immutable')

    return response.download(cheminPhoto(fichier))
  }

  /**
   * La suppression d'une photo, et de ses fichiers.
   *
   * **Les fichiers d'abord, la ligne ensuite** (#9, #13). Il n'y a ni
   * corbeille ni restauration, et l'ordre est choisi : la ligne partie la
   * première laisserait des fichiers que plus rien ne désigne, donc des
   * orphelins qu'aucun écran ne montre. Dans ce sens-ci, le pire qui
   * arrive est une ligne qui subsiste un instant — et c'est précisément
   * elle qui permet de réessayer.
   */
  async destroy({ params, response }: HttpContext) {
    const photo = await Photo.query().where('id', params.id).where('bien_id', params.bienId).first()

    if (!photo) {
      return response.notFound({ message: "Cette photo n'existe pas" })
    }

    await effacerPhoto(photo)
    await photo.delete()

    return response.noContent()
  }
}

/** Les photos d'un Bien, de la représentative à la dernière ajoutée. */
export async function photosDuBien(bienId: number): Promise<Photo[]> {
  /**
   * Le rang, puis l'`id` : deux photos d'un même envoi peuvent porter le
   * même rang si un lot a été interrompu, et l'ordre resterait sinon
   * instable d'un chargement à l'autre.
   */
  return Photo.query().where('bien_id', bienId).orderBy('rang', 'asc').orderBy('id', 'asc')
}

/**
 * Le message d'un envoi refusé, dans les mots de l'acheteur — et nommant le
 * fichier, sans quoi il ne saurait pas lequel de ses huit clichés est en
 * cause.
 */
function messageRefus(nom: string, type?: string): string {
  if (type === 'extname') {
    return `« ${nom} » n'est pas une image (${TYPES_ACCEPTES.join(', ')})`
  }

  if (type === 'size') {
    return `« ${nom} » dépasse ${TAILLE_MAX_MO} Mo`
  }

  return `« ${nom} » n'a pas pu être ajoutée`
}
