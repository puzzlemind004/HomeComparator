# Le temps de trajet domicile-travail est saisi à la main

Le temps de trajet jusqu'au lieu de travail est l'un des Critères identifiés comme importants dès l'expression du besoin. Il est saisi manuellement : l'acheteur consulte un service de cartographie une fois par Bien et reporte la valeur.

Le calcul automatique via une API de cartographie (Google Maps, OpenRouteService) a été envisagé et repoussé. Il suppose une clé API, sa configuration et son quota, pour un gain limité à quelques dizaines de secondes par Bien — et il est de toute façon inapplicable tant qu'un Bien peut exister sans adresse (ADR-0008), ce qui est le cas courant à la création.

Décision volontairement laissée ouverte : si le nombre de Biens rend le report manuel pénible, le calcul automatique pourra être ajouté pour les Biens dont l'adresse est renseignée. Rien dans le modèle ne s'y oppose.
