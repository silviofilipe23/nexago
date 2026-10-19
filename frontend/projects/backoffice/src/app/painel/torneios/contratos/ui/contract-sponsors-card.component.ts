import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import { brl } from '../../planos/data/tournament-plans';
import {
  LOGO_STATUS_VIEW,
  sortSponsors,
  sponsorsRevenueCents,
  tierDeliveryLabel,
  tierUsage,
  type PlanContract,
  type PlanSponsor,
} from '../data/plan-contracts';

/**
 * Cotas do evento: ocupação por nível e cada patrocinador com a logo em tamanho de conferir.
 * Logo do organizador: a NexaGO aprova ou recusa. Patrocinador da NexaGO: troca a logo e remove.
 */
@Component({
  selector: 'bo-contract-sponsors-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PillComponent],
  template: `
    <div class="top">
      <div>
        <div class="kicker">Transmissão</div>
        <h2>Cotas de patrocínio</h2>
      </div>
      <div class="spacer"></div>
      @if (contract().sponsors.enabled && editable()) {
        <button type="button" class="bo-mini-btn" [disabled]="busyId() !== null" (click)="add.emit()">
          <bo-icon name="plus" [size]="13" /> Patrocinador NexaGO
        </button>
      }
    </div>

    @if (!contract().sponsors.enabled) {
      <p class="muted">Este plano não tem cotas: sem transmissão (ou cotas fora de venda no dia do pedido).</p>
    } @else {
      <div class="tiers">
        @for (u of usage(); track u.tier.id) {
          <div class="tier" [style.border-top-color]="u.tier.color">
            <span class="tier-name" [style.color]="u.tier.color">{{ u.tier.name }}</span>
            <b>{{ u.used }}<span> / {{ u.tier.maxPerEvent }}</span></b>
            <span class="tier-sub">{{ brl(u.tier.priceCents) }} · {{ delivery(u.tier) }}</span>
          </div>
        }
      </div>
      <p class="muted small">
        {{ sponsors().length }} {{ sponsors().length === 1 ? 'patrocinador' : 'patrocinadores' }} · {{ brl(revenue()) }} em cotas ·
        repasse estimado ao organizador: {{ brl(share()) }} ({{ contract().sponsors.organizerSharePct }}%, como o portal dele mostra)
        @if (!contract().sponsors.logoApproval) { · aprovação de logo desligada no pedido }
      </p>

      <ul class="list">
        @for (s of sorted(); track s.id) {
          <li class="sponsor" [class.review]="s.logoStatus === 'review'">
            <a class="logo" [class.empty]="!s.logoUrl" [attr.href]="s.logoUrl" target="_blank" rel="noopener"
              [attr.aria-label]="s.logoUrl ? 'Abrir a logo de ' + s.name + ' em tamanho real' : null">
              @if (s.logoUrl) { <img [src]="s.logoUrl" [alt]="'Logo de ' + s.name" /> } @else { <span>SEM LOGO</span> }
            </a>
            <div class="info">
              <div class="name-row">
                <strong>{{ s.name }}</strong>
                <bo-pill [tone]="view(s).tone">{{ view(s).label }}</bo-pill>
              </div>
              <span class="meta">
                <span [style.color]="s.tier.color">{{ s.tier.name }}</span> · {{ brl(s.tier.priceCents) }} ·
                {{ s.source === 'nexago' ? 'Trazido pela NexaGO' : 'Indicado pelo organizador' }}
              </span>
              @if (s.logoStatus === 'rejected' && s.logoRejectReason) { <span class="reason">Motivo: {{ s.logoRejectReason }}</span> }
              @if (s.logoStatus === 'missing' && s.source === 'organizer') { <span class="meta">O organizador ainda não enviou a logo.</span> }
            </div>
            @if (editable()) {
              <div class="acts">
                @if (s.source === 'organizer') {
                  @if (s.logoUrl) {
                    @if (s.logoStatus !== 'rejected') {
                      <button type="button" [class]="s.logoStatus === 'review' ? 'bo-mini-btn' : 'bo-ghost-btn danger'"
                        [disabled]="busyId() !== null" (click)="reject.emit(s)">Recusar</button>
                    }
                    @if (s.logoStatus !== 'approved') {
                      <button type="button" [class]="s.logoStatus === 'review' ? 'bo-mini-btn bo-mini-btn-primary' : 'bo-ghost-btn'"
                        [disabled]="busyId() !== null" (click)="approve.emit(s)">
                        {{ busyId() === s.id ? 'Salvando…' : 'Aprovar' }}
                      </button>
                    }
                  }
                } @else {
                  <button type="button" class="bo-ghost-btn" [disabled]="busyId() !== null" (click)="changeLogo.emit(s)">
                    {{ busyId() === s.id ? 'Enviando…' : s.logoUrl ? 'Trocar logo' : 'Enviar logo' }}
                  </button>
                  <button type="button" class="bo-ghost-btn danger" [disabled]="busyId() !== null"
                    [attr.aria-label]="'Remover ' + s.name" (click)="remove.emit(s)"><bo-icon name="trash" [size]="13" /></button>
                }
              </div>
            }
          </li>
        } @empty {
          <li class="muted none">
            {{ editable() ? 'Nenhum patrocinador ainda. O organizador indica pelo portal; a NexaGO pode trazer os dela.' : 'Nenhum patrocinador neste evento.' }}
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; padding: 20px 22px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    .top { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
    .spacer { flex: 1; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h2 { margin: 4px 0 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .muted { margin: 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .muted.small { margin-top: 10px; font-size: 11.5px; }
    .tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .tier { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); border-top: 3px solid; }
    .tier-name { font-family: var(--nx-font-display); font-weight: 800; font-size: 13px; }
    .tier b { font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; }
    .tier b span { font-size: 13px; color: var(--nx-text-dim); font-weight: 600; }
    .tier-sub { font-size: 11px; color: var(--nx-text-dim); }
    .list { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; }
    .sponsor { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--nx-line); }
    .sponsor.review .logo { border-color: var(--nx-pending); }
    .logo { flex: none; width: 132px; height: 74px; display: grid; place-items: center; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); text-decoration: none;
      /* Xadrez: logo com fundo transparente aparece como é; fundo branco chapado fica evidente. */
      background: repeating-conic-gradient(#20242c 0% 25%, #171a20 0% 50%) 50% / 14px 14px; }
    .logo img { max-width: 116px; max-height: 60px; object-fit: contain; }
    .logo.empty { background: var(--nx-surface-1); border-style: dashed; cursor: default; }
    .logo span { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.14em; color: var(--nx-text-dim); }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .name-row strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; }
    .meta { font-size: 11.5px; color: var(--nx-text-dim); }
    .reason { font-size: 11.5px; color: var(--nx-live); }
    .acts { display: flex; align-items: center; gap: 6px; flex: none; }
    .acts button:disabled { opacity: 0.45; cursor: not-allowed; }
    .none { padding: 14px 0 0; border-top: 1px solid var(--nx-line); }
  `,
})
export class ContractSponsorsCardComponent {
  readonly contract = input.required<PlanContract>();
  readonly sponsors = input.required<PlanSponsor[]>();
  /** Contrato em aberto: decisões e cotas da NexaGO liberadas. */
  readonly editable = input(false);
  /** Patrocinador com ação em andamento (trava os outros botões). */
  readonly busyId = input<string | null>(null);

  readonly approve = output<PlanSponsor>();
  readonly reject = output<PlanSponsor>();
  readonly add = output<void>();
  readonly changeLogo = output<PlanSponsor>();
  readonly remove = output<PlanSponsor>();

  protected readonly brl = brl;
  protected readonly sorted = computed(() => sortSponsors(this.sponsors()));
  protected readonly usage = computed(() => tierUsage(this.contract().sponsors.tiers, this.sponsors()));
  protected readonly revenue = computed(() => sponsorsRevenueCents(this.sponsors()));
  protected readonly share = computed(() => Math.round((this.revenue() * this.contract().sponsors.organizerSharePct) / 100));

  protected view(s: PlanSponsor) {
    return LOGO_STATUS_VIEW[s.logoStatus];
  }
  protected delivery(t: PlanSponsor['tier']): string {
    return tierDeliveryLabel(t);
  }
}
