import { Injectable, signal } from '@angular/core';

/** Círculo de onde a foto foi aberta, em coordenadas de viewport — o visualizador cresce
 *  daqui. Nas listagens os avatares da dupla se sobrepõem (-16px), então essa origem é o que
 *  diz ao organizador QUAL dos dois ele abriu. */
export interface PersonPhotoOrigin {
  cx: number;
  cy: number;
  size: number;
}

export interface PersonPhoto {
  photoUrl: string;
  /** Papel de quem está na foto — "Atleta" nas listagens de inscrição, "Gestor"/"Mesário" na
   *  equipe do torneio. */
  role: string;
  name: string;
  /** Linha de contexto da identificação (categoria, dupla, desde quando está na equipe). */
  meta: string | null;
  origin: PersonPhotoOrigin | null;
  /** Avatar clicado — o foco volta pra ele ao fechar. */
  returnFocusTo: HTMLElement | null;
}

/** Foto de pessoa aberta no painel. Um único visualizador (`og-person-photo`) fica montado no
 *  shell e escuta este sinal, então qualquer avatar da árvore abre a foto sem que a página
 *  precise carregar estado nenhum. */
@Injectable({ providedIn: 'root' })
export class PersonPhotoService {
  private readonly current = signal<PersonPhoto | null>(null);
  readonly photo = this.current.asReadonly();

  open(photo: PersonPhoto): void {
    this.current.set(photo);
  }

  close(): void {
    this.current.set(null);
  }
}
