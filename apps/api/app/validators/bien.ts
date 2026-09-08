import vine, { SimpleMessagesProvider } from '@vinejs/vine'

/**
 * Un Bien se crée avec son seul Libellé (ADR-0008). L'URL de l'Annonce est
 * la seule autre donnée acceptée ici ; les Critères viendront ensuite, par
 * la complétion, chacun avec sa propre colonne (ADR-0004).
 */
export const creerBienValidator = vine.compile(
  vine.object({
    // `trim` avant `minLength` : une saisie d'espaces ne fait pas un Libellé,
    // elle ne sert pas la reconnaissance qui est la raison d'être du champ.
    libelle: vine.string().trim().minLength(1).maxLength(255),

    /**
     * Un champ laissé vide dans le formulaire arrive en chaîne vide. Elle
     * vaut « pas d'Annonce » — donc `null` en base, et non une erreur de
     * saisie. `parse` s'exécute avant les règles, ce qui évite de faire
     * porter à `url` une chaîne vide qu'elle rejetterait.
     */
    urlAnnonce: vine
      .string()
      .parse((valeur) => (typeof valeur === 'string' && valeur.trim() === '' ? null : valeur))
      .trim()
      // `maxLength` avant `url` : au-delà de la borne, c'est la longueur
      // qu'il faut annoncer, et non une adresse invalide.
      .maxLength(2048)
      .url()
      .nullable()
      .optional(),
  })
)

/**
 * Les messages sont rédigés pour être lus tels quels par l'acheteur : ils
 * remontent jusqu'au formulaire sans traduction intermédiaire.
 */
creerBienValidator.messagesProvider = new SimpleMessagesProvider({
  'libelle.required': 'Le Libellé est obligatoire',
  'libelle.minLength': 'Le Libellé est obligatoire',
  // Une saisie qui n'est pas du texte ne vient pas du formulaire, mais le
  // message part quand même vers une interface : il se lit comme les autres.
  'libelle.string': 'Le Libellé est obligatoire',
  'libelle.maxLength': 'Le Libellé ne doit pas dépasser 255 caractères',
  'urlAnnonce.string': "L'URL de l'Annonce n'est pas une adresse valide",
  'urlAnnonce.url': "L'URL de l'Annonce n'est pas une adresse valide",
  'urlAnnonce.maxLength': "L'URL de l'Annonce ne doit pas dépasser 2048 caractères",
})
