import { Injectable, signal } from '@angular/core';

/** Círculo de onde a foto foi aberta, em coordenadas de viewport — o visualizador cresce daqui. */
export interface PersonPhotoOrigin {
  cx: number;
  cy: number;
  size: number;
}

export interface PersonPhoto {
  photoUrl: string;
  /** Papel de quem está na foto — vira o kicker do visualizador ("Aluno", "Atleta"). */
  role: string;
  name: string;
  /** Linha de contexto sob o nome (plano, turma). */
  meta: string | null;
  origin: PersonPhotoOrigin | null;
  /** Avatar clicado — o foco volta pra ele ao fechar. */
  returnFocusTo: HTMLElement | null;
}

/** Foto de pessoa aberta no painel. Um único visualizador (`ar-person-photo`) fica montado no
 *  shell e escuta este sinal, então qualquer avatar da árvore abre a foto sem estado na página.
 *  Mesmo desenho do portal do organizador (`og-person-photo`). */
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
