# Cartes sur mobile, tableau sur desktop

La vue principale est un tableau — une ligne par Bien, une colonne par Critère, triable. Sur mobile, ce tableau est remplacé par une liste de cartes, et non par un tableau à défilement horizontal ou à colonnes sélectionnables.

Un tableau de quinze colonnes sur un écran de téléphone est illisible quelle que soit l'astuce employée ; le défilement horizontal détruit précisément ce qui fait l'intérêt d'un tableau, la comparaison d'un coup d'œil. Le coût assumé est de concevoir et maintenir deux présentations de la même donnée, ce qui est cohérent avec ADR-0005.

La vue de comparaison face-à-face suit la même logique : deux Biens au maximum sur mobile, davantage sur desktop. Deux colonnes étroites avec mise en évidence des écarts restent lisibles sur téléphone, et le face-à-face sert de toute façon à départager des finalistes.
