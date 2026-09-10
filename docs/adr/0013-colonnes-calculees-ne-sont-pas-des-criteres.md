# Les Colonnes calculées ne sont pas des Critères

Le carnet compare des Biens sur leurs Critères, chacun adossé à une colonne SQL et décrit par la définition centralisée (ADR-0004). Le prix au mètre carré échappe à ce rangement : c'est la valeur qui permet de comparer un deux-pièces et un quatre-pièces, donc un chiffre que l'acheteur lit comme les autres, mais il ne se saisit nulle part — il se déduit du prix demandé et de la surface habitable.

Nous ne le stockons pas. Une colonne de plus en base, tenue à jour à chaque écriture, pourrait contredire les deux Critères dont elle sort : un prix corrigé sans recalcul, et le carnet affiche un prix au m² qui ne correspond à rien. La valeur dérivée ne peut pas diverger de ses sources.

Nous n'en faisons pas non plus un Critère. La définition centralisée tient parce que chacune de ses entrées a une colonne : c'est ce qui permet au formulaire de saisie, à l'assistant de complétion et au validateur de s'y fier sans distinguer les cas. Y glisser une entrée sans colonne obligerait chacun de ces écrans à se demander, pour chaque Critère, s'il est saisissable — et ferait chercher en base une colonne qui n'existe pas.

Nous introduisons donc la **Colonne** : ce qui se compare et se trie à l'écran. Une Colonne présente un Critère, ou calcule sa valeur à partir de plusieurs. C'est le genre dont le Critère est une espèce, et c'est ce que le tableau et la comparaison manipulent réellement. Le tri et la mise en évidence du meilleur Bien travaillent sur des Colonnes : ils classent le prix au m² sans savoir qu'il est calculé, parce qu'une Colonne calculée déclare son sens de comparaison comme n'importe quelle autre.

Le mot demande une précaution. Côté API, « colonne » désigne la colonne SQL — `Bien.colonnesDeListe()`, et ADR-0004 qui pose que chaque Critère en est une. Les deux sens ne se croisent jamais dans un même fichier : l'adapter d'ADR-0010 est la frontière, et la Colonne n'existe que du côté écran, une fois les Biens reçus. Le glossaire porte cette distinction plutôt qu'un nom plus long, qui aurait alourdi chaque mention pour lever une ambiguïté que le contexte lève déjà.

Deux conséquences en découlent.

Le prix au mètre carré reste **codé en dur** comme le cas particulier qu'il est, et non comme la première entrée d'une liste de Colonnes calculées. Il est aujourd'hui la seule, et une liste générique inventerait l'abstraction avant d'en connaître la deuxième instance ; `Colonne` étant déjà l'interface commune, la généraliser le jour venu se fera à peu de frais.

Et il vaut **pour toutes les formes du carnet**, cartes mobiles comprises (ADR-0006), non pour le seul tableau desktop. C'est précisément sur mobile, où les Biens se lisent l'un après l'autre plutôt que côte à côte, que le prix ramené au mètre carré porte le plus : il permet de situer un Bien sans avoir l'autre sous les yeux. Les cartes ne l'affichent pas encore (#11) ; l'intention est écrite ici pour que cette question n'ait pas à se retrancher à l'aveugle.
