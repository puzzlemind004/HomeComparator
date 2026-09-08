# Saisie manuelle uniquement, pas d'extraction depuis les portails

Le plan initial était de pré-remplir le formulaire à partir des métadonnées Open Graph de l'URL de l'annonce collée. Une vérification empirique des sept principaux portails français (2026-09-08) a montré que SeLoger, Logic-Immo et Leboncoin renvoient tous un 403 derrière DataDome — blocage qui persiste avec l'user-agent des crawlers sociaux, car la détection porte sur l'empreinte TLS et la réputation IP, pas sur l'user-agent. Bien'ici est une SPA dont les balises OG sont génériques et identiques d'une annonce à l'autre. Seuls PAP, Orpi et Century 21 exposent des OG exploitables.

Nous avons donc renoncé à toute extraction automatique : l'utilisateur saisit chaque Bien à la main, et l'URL de l'Annonce n'est qu'un lien stocké. En conséquence, la qualité du formulaire de saisie devient l'enjeu central du produit — il doit être rapide et confortable, y compris sur mobile pendant une visite. Cela supprime aussi toute dépendance au HTML des portails et toute question sur leurs CGU, dont plusieurs (SeLoger, Leboncoin) interdisent explicitement l'extraction automatisée.

Réversible sans douleur : si le besoin se fait sentir, un pré-remplissage OG pour PAP/Orpi/Century 21 pourra être ajouté par-dessus le formulaire manuel, qui restera de toute façon le chemin principal.
