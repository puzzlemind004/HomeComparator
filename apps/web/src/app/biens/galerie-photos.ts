import { Component, Input, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { PhotoService } from './photo.service';
import type { Photo } from './photo';

/**
 * La galerie de photos d'un Bien (#13).
 *
 * C'est ce qui répond le plus directement au problème d'origine : dans un
 * mois, « le T3 rue Victor Hugo » n'évoquera plus rien sans image. Les
 * photos prises sur place montrent ce que l'annonce cache — le défaut du
 * mur, la vue réelle depuis le balcon, l'état de la salle de bain.
 *
 * **L'ajout depuis un téléphone pendant une visite est le cas principal**,
 * pas un bonus. C'est ce qui décide de la forme : un seul geste qui ouvre
 * appareil photo ou galerie (`capture` laissé libre, `multiple` posé), et
 * une série qui part d'un coup plutôt qu'une photo à la fois — on est debout
 * dans un couloir, pas assis devant un écran.
 */
@Component({
  selector: 'app-galerie-photos',
  imports: [],
  templateUrl: './galerie-photos.html',
  styleUrl: './galerie-photos.scss',
})
export class GaleriePhotos {
  private readonly photoService = inject(PhotoService);

  private bienId!: number;

  @Input({ required: true })
  set bien(id: number) {
    this.bienId = id;
    this.charger();
  }

  readonly photos = signal<Photo[]>([]);

  /**
   * L'API injoignable est un état à afficher et non une galerie vide : dire
   * « aucune photo » d'un Bien qui en a se lirait comme une perte de
   * fichiers qu'on ne repassera pas prendre.
   */
  readonly chargee = signal(false);

  readonly envoi = signal(false);
  readonly erreurs = signal<string[]>([]);

  /**
   * La photo ouverte en grand, ou `null`. Une vignette seule ne montre pas
   * le défaut du mur qui justifie qu'on l'ait prise.
   */
  readonly agrandie = signal<Photo | null>(null);

  private readonly fenetre = viewChild<ElementRef<HTMLDialogElement>>('fenetre');

  /** La photo dont la suppression attend confirmation. */
  readonly confirmation = signal<Photo | null>(null);

  private charger(): void {
    this.photoService.lister(this.bienId).subscribe((galerie) => {
      this.chargee.set(galerie.chargee);
      this.photos.set(galerie.chargee ? galerie.photos : []);
    });
  }

  /**
   * L'envoi des fichiers choisis.
   *
   * Le champ est vidé après coup : sans cela, choisir à nouveau le même
   * fichier ne déclencherait aucun événement — le navigateur ne signale
   * qu'un changement de valeur —, et l'acheteur croirait l'envoi perdu.
   */
  choisir(evenement: Event): void {
    const champ = evenement.target as HTMLInputElement;
    const fichiers = Array.from(champ.files ?? []);

    champ.value = '';

    if (!fichiers.length || this.envoi()) {
      return;
    }

    this.envoi.set(true);
    this.erreurs.set([]);

    this.photoService.ajouter(this.bienId, fichiers).subscribe((resultat) => {
      this.envoi.set(false);

      if (!resultat.ajoutees) {
        this.erreurs.set(resultat.erreurs);
        return;
      }

      /**
       * Les nouvelles à la suite des anciennes, sans recharger : l'API les
       * rend déjà dans l'ordre où elle vient de les ranger, et une requête
       * de plus ferait attendre sur la connexion qui est justement celle de
       * la visite.
       */
      this.photos.update((photos) => [...photos, ...resultat.photos]);
      this.chargee.set(true);
    });
  }

  /**
   * L'ouverture de la photo en grand.
   *
   * `showModal` et non un attribut `open` : c'est cet appel — et lui seul —
   * qui fait d'un `dialog` une vraie fenêtre modale, avec son fond inerte,
   * son piège au clavier et sa fermeture par Échap. Posé en attribut,
   * l'élément s'afficherait sans rien de tout cela, et il aurait fallu le
   * réécrire à la main (ADR-0005).
   *
   * Appelé ici plutôt que depuis un `effect` : le `@if` du gabarit rend
   * l'élément dès que le signal change, et un effet pour enchaîner sur ce
   * rendu demanderait l'environnement Angular complet que les écrans du
   * projet se passent d'avoir en test.
   */
  agrandir(photo: Photo): void {
    this.agrandie.set(photo);

    /**
     * Après le rendu, que le signal vient de déclencher : l'élément n'existe
     * pas encore à cet instant, `@if` ne l'ayant pas posé. `queueMicrotask`
     * suffit — Angular rend de façon synchrone sur un changement de signal
     * dans un gestionnaire d'événement.
     *
     * La garde couvre les deux cas où il n'y a rien à ouvrir : pas de
     * fenêtre rendue, ou une déjà ouverte, sur laquelle `showModal` lèverait.
     */
    queueMicrotask(() => {
      const fenetre = this.fenetre()?.nativeElement;

      if (fenetre && !fenetre.open) {
        fenetre.showModal();
      }
    });
  }

  /**
   * La fermeture, qu'elle vienne du bouton ou d'Échap.
   *
   * `close()` sur une fenêtre déjà fermée est sans effet, et l'événement
   * `close` rappelle cette méthode : la garde sur `agrandie` évite qu'Échap
   * ne déclenche un second tour inutile.
   */
  refermer(): void {
    const fenetre = this.fenetre()?.nativeElement;

    if (fenetre?.open) {
      fenetre.close();
    }

    this.agrandie.set(null);
  }

  /**
   * La suppression se confirme, comme celle d'un Bien : il n'y a ni
   * corbeille ni restauration, et le fichier part pour de bon (ADR-0007).
   * Une photo de visite ne se reprend pas.
   */
  demanderSuppression(photo: Photo): void {
    this.erreurs.set([]);
    this.confirmation.set(photo);
  }

  annulerSuppression(): void {
    this.confirmation.set(null);
  }

  supprimer(): void {
    const photo = this.confirmation();

    if (!photo || this.envoi()) {
      return;
    }

    this.envoi.set(true);
    this.erreurs.set([]);

    this.photoService.supprimer(this.bienId, photo.id).subscribe((resultat) => {
      this.envoi.set(false);

      if (resultat.supprimee || resultat.disparue) {
        this.photos.update((photos) => photos.filter(({ id }) => id !== photo.id));
        this.confirmation.set(null);

        // La photo agrandie était peut-être celle qu'on vient de supprimer :
        // la laisser ouverte montrerait une image que plus rien ne sert.
        if (this.agrandie()?.id === photo.id) {
          this.agrandie.set(null);
        }

        return;
      }

      // L'échec laisse la confirmation ouverte : la photo est toujours là,
      // et le geste à refaire est celui-là même.
      this.erreurs.set(resultat.erreurs);
    });
  }
}
