import { Injectable, computed, signal } from '@angular/core';

/** Círculo de onde a foto foi aberta, em coordenadas de viewport — o visualizador cresce daqui. */
export interface PersonPhotoOrigin {
  cx: number;
  cy: number;
  size: number;
}

/** Quem está na foto — o que o visualizador mostra no card. */
export interface PersonPhotoEntry {
  photoUrl: string;
  /** Papel de quem está na foto — vira o kicker do visualizador ("Aluno", "Atleta"). */
  role: string;
  name: string;
  /** Linha de contexto sob o nome (plano, turma). */
  meta: string | null;
}

export interface PersonPhoto extends PersonPhotoEntry {
  origin: PersonPhotoOrigin | null;
  /** Avatar clicado — o foco volta pra ele ao fechar. */
  returnFocusTo: HTMLElement | null;
  /** Fotos vizinhas (os jogadores de uma reserva, por exemplo): o visualizador navega entre elas
   *  com setas. Sem galeria, ou com uma foto só, fica como antes. */
  gallery?: readonly PersonPhotoEntry[];
}

/** Posição da foto aberta na galeria; `-1` quando não está nela. */
export function galleryIndex(photo: PersonPhoto): number {
  return photo.gallery?.findIndex((e) => e.photoUrl === photo.photoUrl && e.name === photo.name) ?? -1;
}

/** A foto vizinha (`delta` -1 ou +1, dando a volta). Origem zerada: ao fechar, o card não volta
 *  pro círculo de um avatar que não é o dele. */
export function stepGallery(photo: PersonPhoto, delta: number): PersonPhoto {
  const gallery = photo.gallery ?? [];
  const index = galleryIndex(photo);
  if (gallery.length < 2 || index < 0) return photo;
  const next = gallery[(index + delta + gallery.length) % gallery.length]!;
  return { ...photo, ...next, origin: null };
}

/** Foto de pessoa aberta no painel. Um único visualizador (`ar-person-photo`) fica montado no
 *  shell e escuta este sinal, então qualquer avatar da árvore abre a foto sem estado na página.
 *  Mesmo desenho do portal do organizador (`og-person-photo`). */
@Injectable({ providedIn: 'root' })
export class PersonPhotoService {
  private readonly current = signal<PersonPhoto | null>(null);
  readonly photo = this.current.asReadonly();
  /** Posição na galeria (`-1` sem galeria) — o contador e as miniaturas leem daqui. */
  readonly index = computed(() => {
    const photo = this.current();
    return photo ? galleryIndex(photo) : -1;
  });

  open(photo: PersonPhoto): void {
    this.current.set(photo);
  }

  step(delta: number): void {
    const photo = this.current();
    if (photo) this.current.set(stepGallery(photo, delta));
  }

  /** Pula direto pra uma foto da galeria (clique na miniatura). */
  show(entry: PersonPhotoEntry): void {
    const photo = this.current();
    if (photo) this.current.set({ ...photo, ...entry, origin: null });
  }

  close(): void {
    this.current.set(null);
  }
}
