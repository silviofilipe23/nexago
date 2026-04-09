import { Injectable } from '@angular/core';

/** Rect em coordenadas de viewport (getBoundingClientRect no momento do clique). */
export interface SharedCardViewportRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface SharedArenaCardSnapshot {
  rect: SharedCardViewportRect;
  outerHtml: string;
  /** scrollY da lista quando o card foi capturado — restauramos na volta. */
  scrollY: number;
  borderRadius: string;
  arenaId: string;
}

@Injectable({ providedIn: 'root' })
export class SharedTransitionService {
  private snapshot?: SharedArenaCardSnapshot;
  /** Após voltar do detalhe: restaurar scroll da lista uma vez. */
  private pendingRestoreScrollY?: number;
  /** Disparar animação de entrada dos cards na lista após reverse. */
  private pendingListReveal = false;
  /** Arena para alinhar scroll + estado do mapa após voltar. */
  private pendingFocusArenaId?: string;

  captureFromCard(el: HTMLElement, arenaId: string): void {
    const r = el.getBoundingClientRect();
    this.snapshot = {
      rect: {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      },
      outerHtml: el.outerHTML,
      scrollY: typeof globalThis.scrollY === 'number' ? globalThis.scrollY : 0,
      borderRadius: globalThis.getComputedStyle(el).borderRadius || '1rem',
      arenaId,
    };
  }

  getSnapshot(): SharedArenaCardSnapshot | undefined {
    return this.snapshot;
  }

  snapshotMatchesArena(arenaId: string): boolean {
    return this.snapshot?.arenaId === arenaId;
  }

  clearSnapshot(): void {
    this.snapshot = undefined;
  }

  flagReturnFromDetail(scrollY: number, withListReveal: boolean, focusArenaId: string): void {
    this.pendingRestoreScrollY = scrollY;
    this.pendingListReveal = withListReveal;
    this.pendingFocusArenaId = focusArenaId;
  }

  consumeReturnToList(): {
    restoreScrollY: number;
    runListReveal: boolean;
    focusArenaId: string;
  } | null {
    if (this.pendingRestoreScrollY === undefined) {
      return null;
    }
    const restoreScrollY = this.pendingRestoreScrollY;
    const runListReveal = this.pendingListReveal;
    const focusArenaId = this.pendingFocusArenaId ?? '';
    this.pendingRestoreScrollY = undefined;
    this.pendingListReveal = false;
    this.pendingFocusArenaId = undefined;
    return { restoreScrollY, runListReveal, focusArenaId };
  }

  buildFlyingCardFromSnapshot(): HTMLElement | null {
    const snap = this.snapshot;
    if (!snap || typeof document === 'undefined') {
      return null;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = snap.outerHtml;
    const el = wrap.firstElementChild;
    if (!(el instanceof HTMLElement)) {
      return null;
    }
    return el;
  }

  positionFlyingCard(
    el: HTMLElement,
    rect: SharedCardViewportRect,
    borderRadius: string,
    boxShadow: string,
  ): void {
    Object.assign(el.style, {
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      zIndex: '9999',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      borderRadius,
      boxShadow,
      overflow: 'hidden',
    });
  }
}
