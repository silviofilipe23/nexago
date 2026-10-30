import { Injectable, signal } from '@angular/core';

/** Chave no `localStorage`: a escolha é do navegador, como no app (que guarda no aparelho). */
export const FOCUS_AUTO_OPEN_KEY = 'nexago-athlete-focus-auto-open';

/**
 * Se o portal entra sozinho no Modo Focus no dia do torneio — escolha do atleta, no Perfil.
 * Desligado por padrão: o Focus deixou de abrir sempre, e a entrada é o "Entrar no Focus" do
 * painel. Mesma regra do app (`focusAutoOpenPreferenceProvider`).
 *
 * `localStorage` indisponível (modo privado, bloqueio de cookies) vale o padrão; a escolha da
 * sessão fica só no signal.
 */
@Injectable({ providedIn: 'root' })
export class FocusAutoOpenService {
  private readonly _enabled = signal(readStored());
  readonly enabled = this._enabled.asReadonly();

  set(enabled: boolean): void {
    this._enabled.set(enabled);
    try {
      if (enabled) localStorage.setItem(FOCUS_AUTO_OPEN_KEY, '1');
      else localStorage.removeItem(FOCUS_AUTO_OPEN_KEY);
    } catch {
      // Fica o signal.
    }
  }
}

function readStored(): boolean {
  try {
    return localStorage.getItem(FOCUS_AUTO_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
