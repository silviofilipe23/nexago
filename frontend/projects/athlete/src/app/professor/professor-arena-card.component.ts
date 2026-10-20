import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ProfessorDialogsComponent, ProfessorDialogsController } from './professor-dialogs';
import {
  displayStatus,
  isLinkOpen,
  linkDateLine,
  type ProfessorArenaOption,
} from './professor-links.model';
import { ProfessorLinksService } from './professor-links.service';
import { PfStatusComponent, PfTypeTagComponent } from './ui/professor-ui.components';

/**
 * "Você é professor?" na página da arena (M3 do protótipo, versão web): pede vínculo para ESTA
 * arena ou, se já existe um em aberto, mostra o estado e leva ao vínculo.
 *
 * O par `{arenaId}_{uid}` sai da lista ao vivo do serviço (mesmo documento, um listener a menos):
 * pedir, aprovar ou encerrar em outra aba atualiza o card na hora.
 */
@Component({
  selector: 'app-professor-arena-card',
  imports: [PfStatusComponent, PfTypeTagComponent, ProfessorDialogsComponent],
  providers: [ProfessorDialogsController],
  template: `
    @if (service.loaded()) {
      <section class="pf-arena-card" aria-labelledby="pf-arena-card-title">
        @if (open(); as o) {
          <span class="pf-arena-card-kicker" id="pf-arena-card-title">Seu vínculo aqui</span>
          <div class="pf-arena-card-row">
            <app-pf-status [status]="o.status" />
            <app-pf-type-tag [type]="o.link.relationshipType" [small]="true" />
          </div>
          @if (o.dateLine) {
            <p class="pf-arena-card-text pf-arena-card-text--mono">{{ o.dateLine }}</p>
          }
          <button type="button" class="pf-arena-card-btn" (click)="openLink()">
            {{ o.status === 'INVITED' ? 'Ver convite' : o.status === 'PENDING' ? 'Ver pedido' : 'Ver vínculo' }}
          </button>
        } @else {
          <span class="pf-arena-card-kicker" id="pf-arena-card-title">Você é professor?</span>
          <p class="pf-arena-card-text">Peça vínculo para dar aulas aqui — na equipe da arena ou como independente.</p>
          @if (previous(); as p) {
            <p class="pf-arena-card-text pf-arena-card-text--mono">Último vínculo: {{ p }}</p>
          }
          <button type="button" class="pf-arena-card-btn" (click)="request()">Solicitar vínculo</button>
        }
      </section>
    }
    <app-professor-dialogs />
  `,
  styles: `
    :host {
      display: block;
    }
    .pf-arena-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 20px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-5);
    }
    .pf-arena-card-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .pf-arena-card-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pf-arena-card-text {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.45;
      color: var(--nx-text-mute);
    }
    .pf-arena-card-text--mono {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .pf-arena-card-btn {
      margin-top: 4px;
      height: 38px;
      padding: 0 18px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .pf-arena-card-btn:hover {
      border-color: var(--nx-line-strong);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessorArenaCardComponent {
  protected readonly service = inject(ProfessorLinksService);
  private readonly ctrl = inject(ProfessorDialogsController);

  readonly arenaId = input.required<string>();
  readonly arenaName = input.required<string>();
  readonly arenaCity = input<string | null>(null);
  readonly arenaLogoUrl = input<string | null>(null);

  private readonly link = computed(() => this.service.links().find((l) => l.arenaId === this.arenaId()) ?? null);

  protected readonly open = computed(() => {
    const link = this.link();
    const now = Date.now();
    if (!link || !isLinkOpen(link, now)) return null;
    return { link, status: displayStatus(link, now), dateLine: linkDateLine(link, now) };
  });

  /** Rodada fechada (encerrado, recusado…): o pedido novo reabre o mesmo vínculo. */
  protected readonly previous = computed(() => {
    const link = this.link();
    const now = Date.now();
    if (!link || isLinkOpen(link, now)) return null;
    return linkDateLine(link, now) || null;
  });

  protected request(): void {
    const arena: ProfessorArenaOption = {
      id: this.arenaId(),
      name: this.arenaName(),
      city: this.arenaCity(),
      logoUrl: this.arenaLogoUrl(),
    };
    this.ctrl.openRequest(arena, this.link()?.relationshipType ?? null, true);
  }

  protected openLink(): void {
    const o = this.open();
    if (!o) return;
    this.ctrl.run(o.link, o.status === 'INVITED' ? 'accept' : 'details');
  }
}
