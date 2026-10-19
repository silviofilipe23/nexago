import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import {
  SPONSOR_STATUS_VIEW,
  brl,
  dayRangeLabel,
  isActiveContract,
  organizerShareCents,
  sponsorsRevenueCents,
  tierUsage,
  validatePlanSponsorLogo,
  type PlanContract,
  type PlanSponsor,
} from '../data/plan-contracts';
import {
  removePlanSponsor,
  setPlanSponsorLogo,
  uploadPlanSponsorLogo,
  watchPlanContract,
  watchPlanSponsors,
} from '../data/plan-contracts-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { OgSponsorDialogComponent } from './sponsor-dialog.component';

/** Sponsors do evento (protótipo 26b): cotas vendidas por nível, patrocinadores com o status
 *  da logo, preview na transmissão e o repasse estimado. Tudo do contrato congelado — preço,
 *  inventário e % de repasse são os do dia em que o plano foi pedido. */
@Component({
  selector: 'og-plano-sponsors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NxPageLoadingComponent,
    OgCardComponent,
    OgConfirmDialogComponent,
    OgIconComponent,
    OgPageHeaderComponent,
    OgPillComponent,
    OgSponsorDialogComponent,
  ],
  template: `
    <og-page-header [title]="title()" [subtitle]="subtitle()">
      <a class="og-ghost-btn" routerLink="/painel/planos"><og-icon name="back" [size]="14" />Planos</a>
      @if (contract()?.sponsors?.enabled) {
        <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="!canAdd()" (click)="dialogOpen.set(true)">
          <og-icon name="plus" [size]="14" />Adicionar patrocinador
        </button>
      }
    </og-page-header>

    <div class="og-content og-sponsors">
      @if (error(); as e) {
        <og-card><p class="muted">{{ e }}</p></og-card>
      } @else if (!ready()) {
        <app-nx-page-loading title="Carregando cotas…" />
      } @else if (!contract()) {
        <og-card kicker="NexaGO Sponsors" title="Este evento não tem plano NexaGO">
          <p class="muted">As cotas de patrocínio vêm com a transmissão do plano. Contrate um plano para o evento e volte aqui.</p>
          <div><a class="og-mini-btn" routerLink="/painel/planos">Ver planos</a></div>
        </og-card>
      } @else if (!contract()!.sponsors.enabled) {
        <og-card kicker="NexaGO Sponsors" title="Sem cotas neste plano">
          <p class="muted">O {{ contract()!.plan.name }} não inclui venda de cotas na transmissão.</p>
        </og-card>
      } @else {
        @if (!editable()) {
          <div class="banner">
            <og-icon name="alert" [size]="15" />
            {{ contract()!.status === 'cancelled' ? 'Pedido cancelado: as cotas ficam só para consulta.' : 'Evento concluído: as cotas ficam só para consulta.' }}
          </div>
        }
        <div class="grid">
          <div class="col">
            <div class="kpis">
              @for (u of usage(); track u.tier.id) {
                <og-card pad="sm" [style.border-top]="'3px solid ' + u.tier.color">
                  <div class="kpi-name" [style.color]="u.tier.color">{{ u.tier.name }}</div>
                  <div class="kpi-value">{{ u.used }}<span> / {{ u.tier.maxPerEvent }}</span></div>
                  <div class="kpi-sub">cotas vendidas · {{ brl(u.tier.priceCents) }} cada</div>
                </og-card>
              }
            </div>

            <og-card kicker="Patrocinadores" title="Neste evento">
              @for (s of sponsors(); track s.id; let last = $last) {
                <div class="sponsor" [class.last]="last">
                  <div class="logo">
                    @if (s.logoUrl) {
                      <img [src]="s.logoUrl" [alt]="s.name" />
                    } @else {
                      <span>LOGO</span>
                    }
                  </div>
                  <div class="sponsor-main">
                    <div class="sponsor-name">{{ s.name }}</div>
                    <div class="sponsor-meta">
                      <span [style.color]="s.tier.color">{{ s.tier.name }}</span> · {{ s.tier.appearances }} aparições ·
                      {{ s.source === 'nexago' ? 'NexaGO' : 'Você indicou' }}
                    </div>
                  </div>
                  <og-pill [tone]="statusView(s).tone">{{ statusView(s).label }}</og-pill>
                  @if (editable() && s.source === 'organizer') {
                    <div class="sponsor-actions">
                      @if (s.logoStatus === 'missing' || s.logoStatus === 'rejected') {
                        <button type="button" class="og-mini-btn" [disabled]="uploadingId() === s.id" (click)="pickLogo(s)">
                          {{ uploadingId() === s.id ? 'Enviando…' : 'Enviar logo' }}
                        </button>
                      } @else {
                        <button type="button" class="og-ghost-btn" [disabled]="uploadingId() === s.id" (click)="pickLogo(s)">
                          {{ uploadingId() === s.id ? 'Enviando…' : 'Trocar logo' }}
                        </button>
                      }
                      <button type="button" class="og-ghost-btn" aria-label="Remover patrocinador" (click)="askRemove(s)">
                        <og-icon name="close" [size]="14" />
                      </button>
                    </div>
                  }
                </div>
              } @empty {
                <p class="muted">Nenhum patrocinador ainda. Adicione quem fechou uma cota com você.</p>
              }
              @if (rowError(); as e) {
                <p class="row-error">{{ e }}</p>
              }
            </og-card>
          </div>

          <div class="col">
            <og-card kicker="Preview" title="Como aparece na transmissão">
              <div class="frame">
                <span class="frame-label">Frame da transmissão · quadra principal</span>
                <span class="frame-live"><span></span>AO VIVO</span>
                <div class="frame-logo" [style.border-color]="previewSponsor()?.logoUrl ? 'transparent' : previewColor()">
                  @if (previewSponsor()?.logoUrl; as src) {
                    <img [src]="src" alt="" />
                  } @else {
                    <span [style.color]="previewColor()">LOGO · {{ previewSeconds() }}s</span>
                  }
                </div>
              </div>
              <p class="frame-note">{{ artNote() }}</p>
            </og-card>

            <og-card kicker="Seu repasse" title="Ganhos com Sponsors">
              <div class="pay-row">
                <span>Cotas vendidas</span><span class="mono">{{ brl(revenue()) }}</span>
              </div>
              <div class="pay-total">
                <span>Você recebe · {{ contract()!.sponsors.organizerSharePct }}%</span>
                <span class="pay-value">{{ brl(share()) }}</span>
              </div>
              <p class="pay-note">Estimativa sobre as cotas cadastradas. O repasse é feito pela NexaGO depois do evento.</p>
            </og-card>
          </div>
        </div>
      }
    </div>

    <input #logoInput type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden (change)="onLogo($event)" />

    @if (dialogOpen()) {
      <og-sponsor-dialog
        [tournamentId]="tournamentId()"
        [usage]="usage()"
        (closed)="dialogOpen.set(false)"
        (added)="dialogOpen.set(false)"
      />
    }

    @if (removeTarget(); as s) {
      <og-confirm-dialog
        title="Remover patrocinador?"
        [message]="s.name + ' sai da cota ' + s.tier.name + ' deste evento, e a logo enviada é apagada.'"
        confirmLabel="Remover"
        [destructive]="true"
        [busy]="removeBusy()"
        [error]="removeError()"
        (confirmed)="confirmRemove(s)"
        (cancelled)="removeTarget.set(null)"
      />
    }
  `,
  styles: `
    .og-sponsors {
      container-type: inline-size;
    }
    .muted {
      margin: 0 0 12px;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .col {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .kpi-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
    }
    .kpi-value {
      margin-top: 6px;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      color: var(--nx-text);
    }
    .kpi-value span {
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .kpi-sub {
      margin-top: 2px;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .sponsor {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .sponsor.last {
      border-bottom: none;
    }
    .logo {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid var(--nx-line);
      display: grid;
      place-items: center;
      overflow: hidden;
      background: repeating-linear-gradient(45deg, var(--nx-surface-1) 0 6px, var(--nx-surface-2) 6px 12px);
      font-family: var(--nx-font-mono);
      font-size: 8px;
      color: var(--nx-text-dim);
    }
    .logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: var(--nx-surface-1);
    }
    .sponsor-main {
      flex: 1;
      min-width: 0;
    }
    .sponsor-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
      overflow-wrap: anywhere;
    }
    .sponsor-meta {
      margin-top: 2px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .sponsor-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .row-error {
      margin: 8px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
    }
    .frame {
      position: relative;
      aspect-ratio: 16 / 9;
      border-radius: var(--nx-r-3);
      overflow: hidden;
      border: 1px solid var(--nx-line);
      background: repeating-linear-gradient(45deg, #101012 0 10px, #141417 10px 20px);
    }
    .frame-label,
    .frame-live {
      position: absolute;
      top: 10px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      text-transform: uppercase;
    }
    .frame-label {
      left: 12px;
      right: 90px;
      color: #8a8a92;
    }
    .frame-live {
      right: 12px;
      display: flex;
      align-items: center;
      gap: 5px;
      font-weight: 700;
      color: var(--nx-live);
    }
    .frame-live span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--nx-live);
    }
    .frame-logo {
      position: absolute;
      right: 12px;
      bottom: 12px;
      width: 110px;
      height: 28px;
      border-radius: 6px;
      border: 1.5px dashed;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
    }
    /* Flex, não grid: na linha "auto" do grid o height 100% não resolve e a logo vaza da caixa. */
    .frame-logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .frame-note,
    .pay-note {
      margin: 10px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }
    .pay-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .mono {
      font-family: var(--nx-font-mono);
      color: var(--nx-text);
    }
    .pay-total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-top: 12px;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .pay-value {
      font-weight: 800;
      font-size: 22px;
      color: var(--nx-win);
    }
    @container (max-width: 900px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @container (max-width: 520px) {
      .sponsor {
        flex-wrap: wrap;
      }
      .sponsor-main {
        flex-basis: calc(100% - 52px);
      }
    }
  `,
})
export class PlanoSponsorsComponent {
  /** Parâmetro de rota — `input()`, nunca `signal()` (withComponentInputBinding). */
  readonly tournamentId = input.required<string>();

  protected readonly brl = brl;

  protected readonly contract = signal<PlanContract | null>(null);
  protected readonly sponsors = signal<PlanSponsor[]>([]);
  protected readonly ready = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly dialogOpen = signal(false);
  protected readonly uploadingId = signal<string | null>(null);
  protected readonly rowError = signal<string | null>(null);
  protected readonly removeTarget = signal<PlanSponsor | null>(null);
  protected readonly removeBusy = signal(false);
  protected readonly removeError = signal<string | null>(null);
  private logoTarget: PlanSponsor | null = null;
  private readonly logoInput = viewChild.required<ElementRef<HTMLInputElement>>('logoInput');

  protected readonly title = computed(() => {
    const c = this.contract();
    return c ? `Sponsors · ${c.tournamentName}` : 'Sponsors do evento';
  });
  protected readonly subtitle = computed(() => {
    const c = this.contract();
    if (!c) return 'Cotas de patrocínio na transmissão';
    return `${c.plan.name} · transmissão da quadra principal · ${dayRangeLabel(c.startDate, c.endDate)}`;
  });
  protected readonly editable = computed(() => {
    const c = this.contract();
    return c != null && isActiveContract(c.status);
  });
  protected readonly usage = computed(() => tierUsage(this.contract()?.sponsors.tiers ?? [], this.sponsors()));
  protected readonly canAdd = computed(() => this.editable() && this.usage().some((u) => u.left > 0));
  protected readonly revenue = computed(() => sponsorsRevenueCents(this.sponsors()));
  protected readonly share = computed(() =>
    organizerShareCents(this.revenue(), this.contract()?.sponsors.organizerSharePct ?? 0),
  );

  /** O preview mostra a logo aprovada da cota mais alta; sem nenhuma, o espaço tracejado. */
  protected readonly previewSponsor = computed<PlanSponsor | null>(() => {
    const tiers = this.contract()?.sponsors.tiers ?? [];
    const rank = (s: PlanSponsor) => tiers.findIndex((t) => t.id === s.tierId);
    const approved = this.sponsors().filter((s) => s.logoStatus === 'approved' && s.logoUrl);
    return approved.sort((a, b) => rank(b) - rank(a)).at(0) ?? null;
  });
  protected readonly previewColor = computed(() => {
    const tiers = this.contract()?.sponsors.tiers ?? [];
    return this.previewSponsor()?.tier.color ?? tiers[tiers.length - 1]?.color ?? '#F4C543';
  });
  protected readonly previewSeconds = computed(() => {
    const tiers = this.contract()?.sponsors.tiers ?? [];
    return this.previewSponsor()?.tier.seconds ?? tiers[0]?.seconds ?? 5;
  });
  protected readonly artNote = computed(() => {
    const base = 'Arte em PNG transparente, 1200 × 300 px.';
    return this.contract()?.sponsors.logoApproval ? `${base} A NexaGO aprova até 48h antes do evento.` : base;
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.ready.set(false);
      this.error.set(null);
      this.contract.set(null);
      this.sponsors.set([]);
      if (!id) {
        this.error.set('Evento não informado.');
        this.ready.set(true);
        return;
      }
      let stopSponsors: (() => void) | null = null;
      const fail = (err: unknown) => {
        console.warn('Sponsors: falha ao ler o contrato', err);
        const msg = err instanceof Error ? err.message : '';
        this.error.set(`Não foi possível carregar as cotas deste evento. ${msg}`.trim());
        this.ready.set(true);
      };
      const stopContract = watchPlanContract(
        id,
        (c) => {
          this.contract.set(c);
          // A rule das cotas lê o dono no contrato: só abre a escuta quando ele existe.
          if (c && c.sponsors.enabled && !stopSponsors) {
            stopSponsors = watchPlanSponsors(
              id,
              (list) => {
                this.sponsors.set(list);
                this.ready.set(true);
              },
              fail,
            );
          } else if (!c || !c.sponsors.enabled) {
            this.ready.set(true);
          }
        },
        fail,
      );
      onCleanup(() => {
        stopContract();
        stopSponsors?.();
      });
    });
  }

  protected statusView(s: PlanSponsor) {
    return SPONSOR_STATUS_VIEW[s.logoStatus];
  }

  protected pickLogo(s: PlanSponsor): void {
    this.logoTarget = s;
    this.rowError.set(null);
    this.logoInput().nativeElement.click();
  }

  protected async onLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    const target = this.logoTarget;
    this.logoTarget = null;
    if (!file || !target) return;
    const issue = validatePlanSponsorLogo(file);
    if (issue) {
      this.rowError.set(issue);
      return;
    }
    this.uploadingId.set(target.id);
    try {
      const url = await uploadPlanSponsorLogo(this.tournamentId(), target.id, file);
      await setPlanSponsorLogo(this.tournamentId(), target.id, url);
    } catch (err) {
      this.rowError.set(err instanceof Error ? err.message : 'Não foi possível enviar a logo.');
    } finally {
      this.uploadingId.set(null);
    }
  }

  protected askRemove(s: PlanSponsor): void {
    this.removeError.set(null);
    this.removeTarget.set(s);
  }

  protected async confirmRemove(s: PlanSponsor): Promise<void> {
    this.removeBusy.set(true);
    this.removeError.set(null);
    try {
      await removePlanSponsor(this.tournamentId(), s.id);
      this.removeTarget.set(null);
    } catch (err) {
      this.removeError.set(err instanceof Error ? err.message : 'Não foi possível remover.');
    } finally {
      this.removeBusy.set(false);
    }
  }
}
