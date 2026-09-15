import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommentaireService } from './commentaire.service';
import { BienService } from './bien.service';
import { ETOILES, estRenseigne, type AjoutCommentaire } from './commentaire';
import { routeFicheBien } from './carnet.routes';

/**
 * L'écran où s'écrit un Commentaire, celui qu'on ouvre pendant la visite.
 *
 * **Le geste tient en une seconde**, et l'écran est dessiné pour cela : la
 * photo d'abord — c'est elle qu'on vient prendre —, puis les étoiles, puis le
 * texte, puis un bouton qui enregistre et referme. Les trois champs sont
 * facultatifs : un mur fissuré se passe de légende, trois étoiles sur une
 * chambre se passent de photo.
 *
 * Un écran à lui et non un formulaire déplié en bas de fiche : l'appareil
 * photo occupe l'écran entier, et en revenir au milieu d'une fiche longue
 * ferait perdre l'endroit où l'on en était.
 */
@Component({
  selector: 'app-commenter-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './commenter-page.html',
  styleUrl: './commenter-page.scss',
})
export class CommenterPage {
  private readonly commentaireService = inject(CommentaireService);
  private readonly bienService = inject(BienService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly id = Number(this.route.snapshot.paramMap.get('id'));

  /** Où l'on revient : la fiche, qu'on ait enregistré ou renoncé. */
  readonly routeFiche = routeFicheBien(this.id);

  /**
   * Le Libellé du Bien commenté, une fois la fiche chargée.
   *
   * Il est affiché parce qu'on arrive ici par un bouton de barre de
   * navigation, parfois sans avoir la fiche sous les yeux : commenter le
   * mauvais Bien pendant une visite en série est une erreur qu'on ne
   * repère qu'un mois plus tard.
   */
  readonly libelle = signal('');

  /** Les cinq étoiles, que le sélecteur pose. */
  readonly etoiles = ETOILES;

  /**
   * La saisie en cours. Un signal et non trois champs nus : le bouton
   * d'enregistrement s'active sur elle, et un champ nu ne le ferait pas
   * réagir.
   */
  readonly saisie = signal<AjoutCommentaire>({ texte: '', photo: null, note: null });

  readonly envoi = signal(false);
  readonly erreurs = signal<string[]>([]);

  /**
   * L'aperçu de la photo choisie, dans le navigateur et sans aller-retour.
   *
   * Sans lui, l'acheteur ne saurait pas laquelle il vient de prendre — et sur
   * un téléphone, l'appareil photo se referme sur un écran qui n'aurait rien
   * changé. L'URL est révoquée au remplacement pour ne pas garder le fichier
   * en mémoire.
   */
  readonly apercu = signal<string | null>(null);

  /** Le nom du fichier choisi, ce que l'aperçu ne dit pas au lecteur d'écran. */
  readonly nomPhoto = signal<string | null>(null);

  /** Vrai quand il y a quelque chose à enregistrer. */
  readonly renseigne = computed(() => estRenseigne(this.saisie()));

  constructor() {
    this.bienService.consulter(this.id).subscribe((fiche) => {
      if (fiche.etat === 'chargee') {
        this.libelle.set(fiche.bien.libelle);
      }
    });
  }

  /** Le texte, à mesure qu'il se tape. */
  ecrire(texte: string): void {
    this.saisie.update((saisie) => ({ ...saisie, texte }));
  }

  /**
   * Une étoile, posée ou retirée.
   *
   * Appuyer sur l'étoile déjà atteinte **efface** la note : c'est le seul
   * moyen de revenir sur un geste fait de travers, et une note qu'on ne peut
   * plus retirer se retrouverait enregistrée faute de mieux.
   */
  noter(note: number): void {
    this.saisie.update((saisie) => ({ ...saisie, note: saisie.note === note ? null : note }));
  }

  /**
   * La photo choisie ou prise.
   *
   * Une seule : le Commentaire en porte une, et c'est ce qui le distingue
   * d'un envoi vers la galerie, où l'on ajoute une série (#13). Le champ est
   * vidé après coup, sans quoi reprendre le même cliché ne déclencherait
   * aucun événement — le navigateur ne signale qu'un changement de valeur.
   */
  choisirPhoto(evenement: Event): void {
    const champ = evenement.target as HTMLInputElement;
    const photo = champ.files?.[0] ?? null;

    champ.value = '';

    if (!photo) {
      return;
    }

    this.remplacerApercu(photo);
    this.saisie.update((saisie) => ({ ...saisie, photo }));
  }

  /** La photo retirée, avant même d'avoir enregistré. */
  retirerPhoto(): void {
    this.remplacerApercu(null);
    this.saisie.update((saisie) => ({ ...saisie, photo: null }));
  }

  /**
   * L'enregistrement, puis le retour à la fiche.
   *
   * Le retour est la fin du geste : on a commenté, on referme, et le
   * carrousel de la fiche montre ce qu'on vient d'écrire. Rester ici
   * obligerait à un appui de plus pour repartir, et laisserait croire que
   * rien n'a été enregistré.
   *
   * Un Commentaire vide n'est pas envoyé : le bouton est désactivé, et ce
   * garde-là vit aussi ici parce qu'un remaniement du gabarit ne doit pas
   * pouvoir le faire disparaître en silence.
   */
  enregistrer(): void {
    if (this.envoi() || !this.renseigne()) {
      return;
    }

    this.envoi.set(true);
    this.erreurs.set([]);

    this.commentaireService.ajouter(this.id, this.saisie()).subscribe((resultat) => {
      this.envoi.set(false);

      if (!resultat.ajoute) {
        this.erreurs.set(resultat.erreurs);
        return;
      }

      this.remplacerApercu(null);
      void this.router.navigate([this.routeFiche]);
    });
  }

  /**
   * L'aperçu courant, remplacé par un autre ou par rien.
   *
   * La précédente URL est révoquée : une `blob:` non libérée retient le
   * fichier entier en mémoire, et une visite en produit autant qu'il y a de
   * pièces.
   */
  private remplacerApercu(photo: File | null): void {
    const precedent = this.apercu();

    if (precedent) {
      URL.revokeObjectURL(precedent);
    }

    this.apercu.set(photo ? URL.createObjectURL(photo) : null);
    this.nomPhoto.set(photo?.name ?? null);
  }
}
