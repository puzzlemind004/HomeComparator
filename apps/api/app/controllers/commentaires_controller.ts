import type { HttpContext } from '@adonisjs/core/http'
import Bien from '#models/bien'
import Commentaire, { NOTE_MAX, NOTE_MIN } from '#models/commentaire'
import Photo from '#models/photo'
import {
  TAILLE_MAX_MO,
  TYPES_ACCEPTES,
  abandonnerTemporaire,
  effacerPhoto,
  enregistrerPhoto,
} from '#services/stockage_photos'

/**
 * Les Commentaires d'un Bien : ce qu'on note pendant la visite.
 *
 * Le geste que ce contrôleur sert est celui d'un acheteur debout dans une
 * pièce : photographier le mur fissuré, mettre deux étoiles, écrire trois
 * mots, et repartir. Tout y répond — l'envoi unique qui porte la photo
 * **et** le texte **et** l'appréciation, et les trois champs facultatifs.
 *
 * Un seul appel et non « créer la photo puis le Commentaire » : sur la
 * connexion d'un couloir, deux allers-retours doublent l'attente, et le
 * second qui échoue laisse une photo que personne n'a demandée.
 */
export default class CommentairesController {
  /** Les Commentaires d'un Bien, du plus récent au plus ancien. */
  async index({ params, response }: HttpContext) {
    const bien = await Bien.find(params.bienId)

    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    const commentaires = await Commentaire.duBien(bien.id).preload('photo')

    return response.ok(commentaires)
  }

  /**
   * L'ajout d'un Commentaire, photo comprise.
   *
   * `multipart` et non JSON : la photo voyage dans le même envoi que le
   * texte, ce qui est tout l'intérêt du geste. Les champs arrivent donc en
   * chaînes, l'appréciation comprise — c'est ce que vaut un formulaire, et
   * la conversion se fait ici.
   */
  async store({ params, request, response }: HttpContext) {
    const bien = await Bien.find(params.bienId)

    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    const envoi = request.file('photo', {
      size: `${TAILLE_MAX_MO}mb`,
      extnames: [...TYPES_ACCEPTES],
    })

    /**
     * Un texte vide vaut absence : le champ est laissé tel quel par un
     * acheteur qui n'a rien à écrire, et enregistrer une chaîne vide ferait
     * afficher un paragraphe blanc dans le carrousel.
     */
    const brut = request.input('texte')
    const texte = typeof brut === 'string' && brut.trim() !== '' ? brut.trim() : null

    const note = lireNote(request.input('note'))

    if (note === 'invalide') {
      await rejeterEnvoi(envoi)

      return response.unprocessableEntity({
        errors: [
          {
            field: 'note',
            rule: 'range',
            message: `L'appréciation va de ${NOTE_MIN} à ${NOTE_MAX} étoiles`,
          },
        ],
      })
    }

    /**
     * Un Commentaire sans texte, sans photo et sans appréciation ne dirait
     * rien — et il s'enregistrerait au moindre appui sur « Ajouter » alors
     * que rien n'a été saisi. Le refus est décidé **avant** d'écrire le
     * fichier : l'inverse aurait laissé une photo sur le volume.
     */
    if (!texte && !envoi && note === null) {
      return response.unprocessableEntity({
        errors: [
          {
            field: 'commentaire',
            rule: 'vide',
            message: 'Un Commentaire porte au moins un texte, une photo ou une appréciation',
          },
        ],
      })
    }

    if (envoi && !envoi.isValid) {
      await rejeterEnvoi(envoi)

      return response.unprocessableEntity({
        errors: [
          {
            field: 'photo',
            rule: envoi.errors[0]?.type ?? 'invalid',
            message: messageRefus(envoi.clientName, envoi.errors[0]?.type),
          },
        ],
      })
    }

    let photo: Photo | null = null

    if (envoi) {
      const fichiers = await enregistrerPhoto(envoi.tmpPath!)

      /**
       * Illisible malgré une extension plausible : fichier tronqué,
       * corrompu, ou format que `sharp` ne décode pas. Le Commentaire n'est
       * pas enregistré sans elle — sans quoi l'acheteur repartirait en
       * croyant sa photo prise.
       */
      if (!fichiers) {
        return response.unprocessableEntity({
          errors: [
            {
              field: 'photo',
              rule: 'illisible',
              message: `« ${envoi.clientName} » n'a pas pu être lue comme une image`,
            },
          ],
        })
      }

      /**
       * La photo rejoint la galerie du Bien au même titre que les autres :
       * rien ne les distingue en base (ADR-0014), et une photo de visite
       * rangée hors de la galerie serait introuvable le jour où on la
       * cherche.
       *
       * Elle se range **à la suite**, comme un envoi depuis la galerie : le
       * rang reprend après la dernière, et la représentative — la première —
       * ne change pas parce qu'on a commenté.
       */
      const dernier = await Photo.query().where('bien_id', bien.id).orderBy('rang', 'desc').first()

      photo = await Photo.create({
        bienId: bien.id,
        fichier: fichiers.fichier,
        fichierVignette: fichiers.fichierVignette,
        rang: (dernier?.rang ?? -1) + 1,
      })
    }

    /**
     * L'écriture du Commentaire peut échouer alors que la photo est déjà
     * sur le volume et en base. Elle est alors défaite : une photo qui
     * n'illustre rien et que l'acheteur n'a pas cru ajouter à la galerie y
     * apparaîtrait sans raison.
     */
    try {
      const commentaire = await Commentaire.create({
        bienId: bien.id,
        texte,
        photoId: photo?.id ?? null,
        note,
      })

      commentaire.$setRelated('photo', photo)

      return response.created(commentaire)
    } catch (erreur) {
      if (photo) {
        await effacerPhoto(photo)
        await photo.delete()
      }

      throw erreur
    }
  }

  /**
   * La suppression d'un Commentaire.
   *
   * **La photo n'est pas emportée.** Elle est dans la galerie du Bien comme
   * n'importe quelle autre (ADR-0014), et l'acheteur qui retire une phrase
   * mal écrite ne demande pas d'effacer le cliché qu'elle accompagnait. La
   * galerie reste l'endroit d'où l'on supprime une photo, et le seul.
   */
  async destroy({ params, response }: HttpContext) {
    const commentaire = await Commentaire.query()
      .where('id', params.id)
      .where('bien_id', params.bienId)
      .first()

    if (!commentaire) {
      return response.notFound({ message: "Ce Commentaire n'existe pas" })
    }

    await commentaire.delete()

    return response.noContent()
  }
}

/**
 * L'appréciation telle que le formulaire l'envoie : un entier de 1 à 5,
 * `null` quand il n'y en a pas, ou `'invalide'` quand ce qui est arrivé
 * n'est ni l'un ni l'autre.
 *
 * Le vide et le zéro valent absence : les étoiles se décochent, et un
 * formulaire rend alors une chaîne vide. Le reste — « 7 », « abc » — est
 * refusé plutôt que ramené dans les bornes : une appréciation qu'on n'a pas
 * donnée ne doit pas s'inventer.
 */
function lireNote(brut: unknown): number | null | 'invalide' {
  if (brut === undefined || brut === null || brut === '' || brut === '0' || brut === 0) {
    return null
  }

  const note = Number(brut)

  if (!Number.isInteger(note) || note < NOTE_MIN || note > NOTE_MAX) {
    return 'invalide'
  }

  return note
}

/**
 * Le temporaire d'un envoi qu'on ne gardera pas.
 *
 * Le bodyparser l'a écrit sur le disque avant que le contrôleur ne décide,
 * et s'arrêter au refus l'y laisserait grossir la couche du conteneur : un
 * refus ne doit pas coûter plus cher au stockage qu'une acceptation.
 */
async function rejeterEnvoi(envoi: { tmpPath?: string } | null): Promise<void> {
  if (envoi?.tmpPath) {
    await abandonnerTemporaire(envoi.tmpPath)
  }
}

/** Le message d'un envoi refusé, dans les mots de l'acheteur. */
function messageRefus(nom: string, type?: string): string {
  if (type === 'extname') {
    return `« ${nom} » n'est pas une image (${TYPES_ACCEPTES.join(', ')})`
  }

  if (type === 'size') {
    return `« ${nom} » dépasse ${TAILLE_MAX_MO} Mo`
  }

  return `« ${nom} » n'a pas pu être ajoutée`
}
