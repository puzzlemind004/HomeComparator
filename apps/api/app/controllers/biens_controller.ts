import type { HttpContext } from '@adonisjs/core/http'
import Bien from '#models/bien'
import { champInconnu, creerBienValidator, modifierBienValidator } from '#validators/bien'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUT_INITIAL, STATUTS } from '#services/statut'
import Photo from '#models/photo'
import { effacerPhoto } from '#services/stockage_photos'

/**
 * Les Biens : les créer avec leur seul Libellé, les retrouver dans une
 * liste, consulter la fiche de l'un d'eux et y modifier n'importe quel
 * Critère. C'est la boucle de repérage — celle qui doit tenir en quelques
 * secondes le soir devant une annonce — puis la complétion, qui vient plus
 * tard, au téléphone ou pendant la visite (ADR-0008).
 *
 * Et la suppression, qui n'appartient à aucune des deux : elle sert à
 * défaire une saisie, un doublon ou une erreur, là où le Statut Écarté sert
 * à consigner une décision (#9).
 */
export default class BiensController {
  /**
   * Tous les Biens enregistrés, du plus récemment repéré au plus ancien, et
   * filtrés par Statut quand la requête en demande un (#7).
   *
   * Le filtre est en SQL et non côté écran : c'est ce que la colonne permet
   * (ADR-0004), et la liste n'a pas à voyager en entier pour qu'on en
   * regarde le quart.
   *
   * Un `statut` que la liste ne connaît pas est **ignoré**, et la liste
   * complète est rendue. C'est un paramètre d'affichage, pas une saisie : le
   * refuser laisserait l'écran sans liste pour une adresse mal recopiée,
   * alors que tout montrer est exactement ce qu'il fait sans filtre.
   */
  async index({ request, response }: HttpContext) {
    const demande: unknown = request.input('statut')
    const statut = STATUTS.find((connu) => connu === demande)

    /**
     * Les Notes ne sont pas rapatriées : aucun écran de liste ne les affiche,
     * et un seul Bien bien rempli pèserait à lui seul plus lourd que tout le
     * reste de la liste réunie (#8). La fiche les demande par `show`, où
     * elles sont précisément ce qu'on vient lire.
     *
     * La sélection est dérivée des colonnes du modèle : un Critère ajouté y
     * entre sans qu'on ait à y penser (ADR-0004).
     */
    const requete = Bien.query()
      .select(Bien.colonnesDeListe())
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')

    // `if` du constructeur de requêtes plutôt que `.if()` : celui-ci masque
    // le rétrécissement de type, et obligerait à réaffirmer que `statut` en
    // est bien un alors que le `find` juste au-dessus vient de l'établir.
    if (statut) {
      requete.where('statut', statut)
    }

    const biens = await requete

    /**
     * La photo représentative de chaque Bien, et elle seule (#13).
     *
     * `preload` avec une limite plutôt que la galerie entière : la liste
     * n'affiche qu'une vignette par Bien, et rapatrier vingt photos de
     * chacun pour n'en montrer qu'une ferait voyager vingt fois trop — la
     * raison même pour laquelle les Notes n'y sont pas (#8).
     *
     * `preload` et non une jointure : une jointure multiplierait les lignes
     * de Biens par leurs photos, et il faudrait défaire ce produit ensuite.
     */
    await preloadPhotoRepresentative(biens)

    return response.ok(biens)
  }

  /** La fiche d'un Bien : tout ce qui a été noté à son sujet (#6). */
  async show({ params, response }: HttpContext) {
    const bien = await Bien.find(params.id)

    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    // La fiche porte la représentative comme la liste : elle sert le retour
    // vers la liste, où la vignette est déjà attendue.
    await preloadPhotoRepresentative([bien])

    return response.ok(bien)
  }

  async store({ request, response }: HttpContext) {
    const { libelle, urlAnnonce } = await request.validateUsing(creerBienValidator)

    // `urlAnnonce` absent du corps et `urlAnnonce` vide décrivent le même
    // Bien : un Bien sans Annonce. On les ramène à `null` ici pour que la
    // colonne soit toujours écrite, et donc toujours rendue au front.
    const bien = await Bien.create({
      libelle,
      urlAnnonce: urlAnnonce ?? null,
      // Le propriétaire n'est pas saisi : il n'y a qu'un utilisateur, et
      // aucun écran ne le demandera (#4).
      proprietaireId: PROPRIETAIRE_UNIQUE,
      // Le Statut ne se saisit pas non plus à la création : un Bien qu'on
      // vient de repérer est « À contacter », et le faire choisir
      // rallongerait le geste de quelques secondes qui fait tout l'écran
      // (ADR-0008). Il se change ensuite depuis la fiche, sans restriction.
      statut: STATUT_INITIAL,
      // Écrits à `null` plutôt que laissés absents, pour la même raison que
      // `urlAnnonce` : Lucid ne sérialise que ce qu'on lui a assigné, et un
      // champ absent de la réponse arriverait `undefined` au front, là où
      // l'adapter et le contrat attendent « pas encore renseigné » (#7, #8).
      notes: null,
      dateVisite: null,
      montantDerniereOffre: null,
    })

    return response.created(bien)
  }

  /**
   * La modification d'un Bien, Critère par Critère (#6).
   *
   * La mise à jour est **partielle** : seuls les champs transmis sont
   * écrits, les autres restent tels quels. C'est ce qui permet à la fiche de
   * n'envoyer que le champ modifié, et à l'assistant de n'envoyer que la
   * réponse à sa question — une question passée n'envoie rien du tout, et
   * n'efface donc rien.
   *
   * La distinction se joue sur la présence de la clé, et non sur sa valeur :
   * un champ absent n'est pas touché, un champ à `null` est vidé. Les
   * confondre reviendrait à effacer quatorze Critères à chaque réponse
   * enregistrée.
   */
  async update({ params, request, response }: HttpContext) {
    // Le Bien est cherché avant la validation : sur un Bien qui n'existe
    // pas, l'absence est ce que l'appelant doit apprendre, et non le détail
    // de ce qui clochait dans sa saisie.
    const bien = await Bien.find(params.id)

    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    const corps = request.body()

    /**
     * Un champ que la modification ne connaît pas est refusé avant tout le
     * reste. Vine laisse passer les clés inconnues au lieu de les rejeter,
     * et sans ce garde une faute de frappe s'enverrait sans rien changer et
     * sans rien dire : l'acheteur croirait avoir saisi une valeur.
     *
     * La réponse a la forme de celles du validateur, pour que le front n'ait
     * qu'une seule sorte de refus à lire.
     */
    const inconnu = champInconnu(corps)

    if (inconnu) {
      return response.unprocessableEntity({
        errors: [
          {
            field: inconnu,
            rule: 'unknown',
            message: `« ${inconnu} » n'est pas un Critère connu`,
          },
        ],
      })
    }

    /**
     * Le corps seul, et non `request.validateUsing` : celui-ci joint les
     * paramètres de route aux données validées, donc `params` — que le
     * modèle refuserait ensuite au `merge`.
     */
    const modifications = await modifierBienValidator.validate(corps)

    // `merge` sur le seul objet validé : Vine n'y laisse que les clés
    // transmises, et les Critères absents ne sont donc jamais écrits.
    bien.merge(modifications)
    await bien.save()

    return response.ok(bien)
  }

  /**
   * La suppression définitive d'un Bien (#9).
   *
   * Elle ne fait pas double emploi avec le Statut Écarté : écarter est une
   * décision de l'acheteur, qu'il veut garder en mémoire et qu'il peut
   * revenir sur ; supprimer corrige une erreur de saisie ou un doublon, et
   * ne laisse rien.
   *
   * Pas de corbeille et pas de restauration : la ligne part pour de bon. Ce
   * qui couvre la fausse manœuvre, c'est la sauvegarde quotidienne
   * (ADR-0007), et côté écran la confirmation explicite — le seul
   * garde-fou avant cet appel.
   *
   * Les photos, elles, sont à défaire ici (#13). Leurs **lignes** partent
   * seules — la clé étrangère porte `ON DELETE CASCADE` —, mais leurs
   * **fichiers** n'ont pas d'équivalent en base : aucune contrainte ne
   * balaie un volume Docker, et c'est ce geste-là qui doit être écrit.
   *
   * **Les fichiers d'abord, la ligne ensuite.** L'ordre est choisi et non
   * subi : il n'y a ni corbeille ni restauration (ADR-0007), et les deux
   * sens ne coûtent pas la même chose. La ligne partie la première
   * laisserait sur le volume des fichiers que plus rien ne désigne — des
   * orphelins qu'aucun écran ne montre et qu'il faudrait un balayage pour
   * retrouver. Dans ce sens-ci, le pire qui arrive est une ligne qui
   * subsiste un instant, et c'est elle qui permet de réessayer.
   *
   * Un fichier récalcitrant n'empêche pas la suppression : `effacerPhoto`
   * journalise et rend la main. Garder dans le carnet un Bien dont
   * l'acheteur a demandé la disparition, pour une raison de disque qui ne
   * le concerne pas, serait le pire des deux résultats.
   *
   * C'est le même geste que la suppression d'une photo seule, écrit une
   * fois et appelé deux (`stockage_photos.ts`).
   */
  async destroy({ params, response }: HttpContext) {
    const bien = await Bien.find(params.id)

    /**
     * Un Bien déjà absent est un 404 et non un 204. La suppression n'est
     * pas un état à atteindre mais un geste sur un Bien précis : l'écran a
     * demandé la disparition de celui-là, et apprendre qu'il n'était déjà
     * plus là — deuxième onglet, deuxième appareil — vaut mieux qu'un
     * succès qui ne dit rien.
     */
    if (!bien) {
      return response.notFound({ message: "Ce Bien n'existe pas" })
    }

    /**
     * Les fichiers avant la ligne, et en parallèle : ils ne dépendent pas
     * les uns des autres, et une visite bien photographiée en compte
     * facilement une vingtaine.
     */
    const photos = await Photo.duBien(bien.id)
    const effacees = await Promise.all(photos.map((photo) => effacerPhoto(photo)))

    /**
     * Un fichier récalcitrant arrête la suppression du Bien, comme il
     * arrête celle d'une photo seule : supprimer la ligne malgré tout
     * laisserait sur le volume des fichiers que plus rien ne désigne, et
     * c'est exactement ce que l'ordre choisi existe pour éviter (ADR-0014).
     *
     * C'est le cas rare — disque plein, volume démonté — et il se répare en
     * réessayant, ce que le Bien encore présent permet. Le Bien reste donc
     * au carnet, et l'écran le dit plutôt que d'annoncer une disparition
     * qui n'a pas eu lieu.
     */
    if (!effacees.every(Boolean)) {
      return response.serviceUnavailable({
        errors: [
          {
            field: 'photos',
            rule: 'stockage',
            message:
              "Les photos du Bien n'ont pas pu être effacées du stockage. Le Bien est toujours là.",
          },
        ],
      })
    }

    await bien.delete()

    // Sans corps : rendre le Bien supprimé inviterait l'écran à l'afficher
    // encore, alors qu'il n'y a plus rien à en dire.
    return response.noContent()
  }
}

/**
 * Attache à chaque Bien sa photo représentative — la première, rang le plus
 * petit — et rien de plus (#13).
 *
 * Une seule requête pour toute la liste, et non une par Bien : la liste
 * comptera quelques dizaines de Biens, et autant d'allers-retours à la base
 * coûteraient plus que tout le reste de la requête réuni.
 *
 * Un Bien sans photo porte un tableau vide, jamais une clé absente : c'est
 * ce que l'adapter du front lit comme « pas de photo », et une clé manquante
 * arriverait `undefined` là où il attend un tableau (ADR-0010).
 */
async function preloadPhotoRepresentative(biens: Bien[]): Promise<void> {
  if (biens.length === 0) {
    return
  }

  const photos = await Photo.ordreGalerie(
    Photo.query().whereIn(
      'bien_id',
      biens.map(({ id }) => id)
    )
  )

  const representative = new Map<number, Photo>()

  for (const photo of photos) {
    // La première rencontrée gagne : la requête les rend déjà dans l'ordre
    // du rang, et c'est la définition de « représentative ».
    if (!representative.has(photo.bienId)) {
      representative.set(photo.bienId, photo)
    }
  }

  for (const bien of biens) {
    const photo = representative.get(bien.id)

    bien.$setRelated('photos', photo ? [photo] : [])
  }
}
