import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClubAccessService } from './data/clube-access.service';

/**
 * Card do Clube no hub do Competir. Só existe com a flag ligada ou para quem testa: enquanto a
 * leitura não volta (ou se ela falhar) não renderiza nada, e o hub segue exatamente como era.
 * O host é `display: contents` para o card cair direto na grade do hub, ocupando a linha toda.
 */
@Component({
  selector: 'app-clube-competir-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (access.visible()) {
      <a class="cc-card" routerLink="/clube" [queryParams]="query">
        <span class="cc-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6z" /><path d="M14 5v2M14 11v2M14 17v2" /></svg>
        </span>
        <span class="cc-body">
          <span class="cc-title-row">
            <span class="cc-title">Clube de Vantagens Nexa</span>
            <span class="cc-new">NOVO</span>
          </span>
          <span class="cc-desc">Descontos dos parceiros NexaGO</span>
        </span>
        <svg class="cc-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </a>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .cc-card {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px;
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-orange-500);
      box-shadow: var(--nx-glow-orange);
      text-decoration: none;
      color: inherit;
      transition: background-color var(--nx-d-fast) ease-out;
    }
    .cc-card:hover {
      background: var(--nx-surface-1);
    }
    .cc-card:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 3px;
    }
    .cc-icon {
      width: 44px;
      height: 44px;
      flex: none;
      display: grid;
      place-items: center;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }
    .cc-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .cc-title-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cc-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .cc-new {
      padding: 2px 7px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .cc-desc {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.4;
      color: var(--nx-text-dim);
    }
    .cc-chevron {
      flex: none;
      color: var(--nx-text-dim);
    }
  `,
})
export class ClubeCompetirCardComponent {
  protected readonly access = inject(ClubAccessService);
  protected readonly query = { origem: 'competir_web' } as const;
}
