# Certains champs n'existent que dans certains Statuts

Un Bien traverse un cycle de vie (À contacter → À visiter → Visité → Offre faite, avec Écarté et Vendu comme sorties possibles à tout moment). Certaines données ne sont pertinentes qu'à partir d'une étape donnée : la date de visite n'a pas de sens sur un Bien « À contacter », le montant de l'offre n'en a pas avant l'état « Offre faite ».

Nous traitons ces champs comme attachés au Statut plutôt que comme des colonnes toujours présentes et souvent vides : le formulaire n'affiche que ce qui est pertinent pour l'état courant, ce qui est le principal levier de simplicité de la saisie (voir ADR-0001, où la saisie manuelle est le chemin unique).

Conséquence à assumer : reculer un Bien dans le cycle (de « Visité » à « À visiter ») laisse des données orphelines. Nous les conservons plutôt que de les effacer — perdre une date de visite ou un montant d'offre à cause d'un mauvais clic serait plus coûteux que d'afficher une donnée devenue hors-contexte.
