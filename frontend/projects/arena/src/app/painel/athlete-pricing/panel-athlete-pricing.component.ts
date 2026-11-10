import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import type { AthleteSearchResult } from '../clubinho/clubs-repository';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import {
  ATHLETE_PRICING_DEFAULT_LABEL,
  ATHLETE_PRICING_TIER_HINT,
  ATHLETE_PRICING_TIERS,
  athletePricingFormError,
  athletePricingFormFromArena,
  athletePricingPayload,
  athletePricingValueLabel,
  type AthletePricingForm,
  type AthletePricingMember,
  type AthletePricingMode,
  type AthletePricingTier,
} from './athlete-pricing.model';
import { AthletePricingService } from './athlete-pricing.service';

/** Tela "Preço por perfil": a arena liga (opcional) o preço de Aluno e/ou Professor e diz quem é
 *  cada um. Quem não está na lista paga o preço normal da quadra (avulso). */
@Component({
  selector: 'ar-panel-athlete-pricing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, IconComponent, AvatarComponent, PillComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Preço por perfil" [subtitle]="subtitle()" />

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading()) {
          <p class="state-text">Carregando…</p>
        } @else {
          <section class="card" aria-labelledby="perfis-title">
            <h2 class="card-title" id="perfis-title">Perfis com preço próprio</h2>
            <p class="card-desc">
              Opcional. Quem não estiver na lista abaixo paga o preço normal da quadra (avulso). Vale para as reservas
              feitas pelo app e pelo site; os descontos não acumulam — fica o menor entre perfil, promoção e cupom.
            </p>

            <div class="tiers">
              @for (tier of tiers; track tier) {
                <div class="tier" [class.on]="form()[tier].enabled">
                  <div class="tier-head">
                    <div>
                      <div class="tier-title" [id]="'tier-' + tier">{{ form()[tier].label || defaultLabel[tier] }}</div>
                      <div class="tier-desc">{{ tierHint[tier] }}</div>
                    </div>
                    <button
                      type="button"
                      class="switch"
                      role="switch"
                      [attr.aria-labelledby]="'tier-' + tier"
                      [class.on]="form()[tier].enabled"
                      [attr.aria-checked]="form()[tier].enabled"
                      [disabled]="readOnly()"
                      (click)="patch(tier, { enabled: !form()[tier].enabled })"
                    ></button>
                  </div>

                  @if (form()[tier].enabled) {
                    <label class="field-label" [attr.for]="'nome-' + tier">Nome do perfil</label>
                    <input
                      [id]="'nome-' + tier"
                      class="text"
                      maxlength="40"
                      [value]="form()[tier].label"
                      [disabled]="readOnly()"
                      (input)="patch(tier, { label: $any($event.target).value })"
                    />

                    <div class="seg" role="radiogroup" [attr.aria-label]="'Tipo de preço — ' + form()[tier].label">
                      <label class="seg-opt" [class.on]="form()[tier].mode === 'fixed'">
                        <input type="radio" [name]="'modo-' + tier" [checked]="form()[tier].mode === 'fixed'" [disabled]="readOnly()" (change)="setMode(tier, 'fixed')" />
                        Preço fixo por hora
                      </label>
                      <label class="seg-opt" [class.on]="form()[tier].mode === 'percent'">
                        <input type="radio" [name]="'modo-' + tier" [checked]="form()[tier].mode === 'percent'" [disabled]="readOnly()" (change)="setMode(tier, 'percent')" />
                        % de desconto
                      </label>
                    </div>

                    <label class="field-label" [attr.for]="'valor-' + tier">
                      {{ form()[tier].mode === 'fixed' ? 'Preço da hora' : 'Desconto sobre o preço da quadra' }}
                    </label>
                    <div class="money">
                      <span>{{ form()[tier].mode === 'fixed' ? 'R$' : '%' }}</span>
                      <input
                        [id]="'valor-' + tier"
                        inputmode="decimal"
                        [value]="form()[tier].value"
                        [disabled]="readOnly()"
                        (input)="patch(tier, { value: $any($event.target).value })"
                      />
                    </div>
                    <p class="hint">
                      {{
                        form()[tier].mode === 'fixed'
                          ? 'Mesmo preço em todas as quadras. Reserva de 30 min sai pela metade.'
                          : 'Aplicado sobre o preço de cada quadra e horário.'
                      }}
                    </p>
                  }
                </div>
              }
            </div>

            @if (configError(); as err) {
              <div class="banner banner-error">{{ err }}</div>
            }
            @if (configSaved()) {
              <div class="banner banner-ok">Preços salvos. Valem para as próximas reservas.</div>
            }
            @if (!readOnly()) {
              <div class="actions">
                <button
                  type="button"
                  class="ar-mini-btn ar-mini-btn-primary"
                  [disabled]="savingConfig() || !dirty() || !!formError()"
                  (click)="saveConfig()"
                >
                  <ar-icon name="check" [size]="14" />
                  {{ savingConfig() ? 'Salvando…' : 'Salvar' }}
                </button>
                @if (dirty()) {
                  <span class="hint inline">{{ formError() ?? 'Alterações não salvas' }}</span>
                }
              </div>
            }
          </section>

          <section class="card" aria-labelledby="lista-title">
            <h2 class="card-title" id="lista-title">Atletas validados</h2>
            <p class="card-desc">
              Quem você validar aqui paga o preço do perfil. O perfil precisa estar ligado acima para valer.
            </p>

            @if (!readOnly()) {
              <div class="add">
                <label class="field-label" for="busca-atleta">Adicionar atleta</label>
                <input
                  id="busca-atleta"
                  class="text"
                  placeholder="Nome ou apelido do atleta…"
                  autocomplete="off"
                  [value]="searchTerm()"
                  (input)="onSearch($any($event.target).value)"
                />
                @if (searching()) {
                  <p class="hint">Buscando…</p>
                } @else if (searchTerm().trim().length >= 2 && results().length === 0) {
                  <p class="hint">Nenhum atleta encontrado.</p>
                }
                @for (r of results(); track r.id) {
                  <div class="row">
                    <ar-avatar [name]="r.name" [photoUrl]="r.photoUrl" [size]="32" zoomable />
                    <div class="row-name">{{ r.name }}</div>
                    @if (memberTierOf(r.id); as current) {
                      <ar-pill tone="dim">{{ tierLabel(current) }}</ar-pill>
                    } @else {
                      @for (tier of tiers; track tier) {
                        <button type="button" class="ar-mini-btn" [disabled]="busyId() === r.id" (click)="addMember(r, tier)">
                          <ar-icon name="plus" [size]="13" />
                          {{ tierLabel(tier) }}
                        </button>
                      }
                    }
                  </div>
                }
              </div>
            }

            @if (memberError(); as err) {
              <div class="banner banner-error">{{ err }}</div>
            }

            <div class="filters">
              <button type="button" class="ar-chip" [class.active]="filter() === 'all'" (click)="filter.set('all')">
                Todos ({{ members().length }})
              </button>
              @for (tier of tiers; track tier) {
                <button type="button" class="ar-chip" [class.active]="filter() === tier" (click)="filter.set(tier)">
                  {{ tierLabel(tier) }} ({{ countOf(tier) }})
                </button>
              }
            </div>

            @if (membersLoading()) {
              <p class="state-text">Carregando…</p>
            } @else {
              @for (m of filteredMembers(); track m.id) {
                <div class="row">
                  <ar-avatar [name]="m.athleteName" [photoUrl]="m.athletePhotoUrl" [size]="32" zoomable />
                  <div class="row-name">
                    {{ m.athleteName }}
                    @if (!form()[m.tier].enabled) {
                      <small class="off">perfil desligado</small>
                    }
                  </div>
                  @if (readOnly()) {
                    <ar-pill [tone]="m.tier === 'student' ? 'green' : 'blue'">{{ tierLabel(m.tier) }}</ar-pill>
                  } @else {
                    <select
                      class="tier-select"
                      [attr.aria-label]="'Perfil de ' + m.athleteName"
                      [value]="m.tier"
                      [disabled]="busyId() === m.athleteId"
                      (change)="changeTier(m, $any($event.target).value)"
                    >
                      @for (tier of tiers; track tier) {
                        <option [value]="tier" [selected]="tier === m.tier">{{ tierLabel(tier) }}</option>
                      }
                    </select>
                    <button
                      type="button"
                      class="ar-mini-btn"
                      [disabled]="busyId() === m.athleteId"
                      [attr.aria-label]="'Tirar ' + m.athleteName + ' da lista'"
                      (click)="removeMember(m)"
                    >
                      Remover
                    </button>
                  }
                </div>
              } @empty {
                <p class="state-text empty">Ninguém na lista ainda. Todo mundo paga o preço avulso.</p>
              }
            }
          </section>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .state-text.empty {
      margin-top: 12px;
    }
    .card {
      background: var(--nx-surface-0, #0b0b0c);
      border: 1px solid var(--nx-line);
      border-radius: 16px;
      padding: 20px 22px;
      max-width: 880px;
    }
    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0;
    }
    .card-desc {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 4px 0 0;
      line-height: 1.5;
    }
    .tiers {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 18px;
    }
    .tier {
      padding: 16px;
      border-radius: 14px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
    }
    .tier.on {
      border-color: rgba(255, 106, 26, 0.55);
    }
    .tier-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 4px;
    }
    .tier-title {
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .tier-desc {
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin-top: 4px;
      line-height: 1.45;
    }
    .field-label {
      display: block;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--nx-text);
      margin: 14px 0 8px;
    }
    .text,
    .tier-select {
      width: 100%;
      height: 44px;
      padding: 0 14px;
      border-radius: 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font: inherit;
      font-size: 14px;
      box-sizing: border-box;
    }
    .tier .text,
    .tier .money {
      background: var(--nx-surface-0, #0b0b0c);
    }
    .text:focus,
    .tier-select:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
    .tier-select {
      width: auto;
      height: 36px;
    }
    .seg {
      display: flex;
      gap: 6px;
      margin-top: 14px;
    }
    .seg-opt {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--nx-line);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--nx-text-mute);
      cursor: pointer;
      position: relative;
      text-align: center;
    }
    .seg-opt input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
    }
    .seg-opt:focus-within {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    .seg-opt.on {
      background: rgba(255, 106, 26, 0.12);
      border-color: rgba(255, 106, 26, 0.55);
      color: var(--nx-orange-400, #ff8a4a);
    }
    .money {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 14px;
      border-radius: 10px;
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 14px;
    }
    .money:focus-within {
      border-color: var(--nx-orange-500);
    }
    .money span {
      color: var(--nx-text-dim);
    }
    .money input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      color: var(--nx-text);
      font: inherit;
      outline: none;
    }
    .hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 8px 0 0;
    }
    .hint.inline {
      margin: 0;
    }
    .switch {
      position: relative;
      width: 40px;
      height: 22px;
      flex: none;
      padding: 0;
      border-radius: 999px;
      background: var(--nx-surface-2, #1b1b1f);
      border: 1px solid var(--nx-line);
      cursor: pointer;
    }
    .switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--nx-text-mute);
      transition: left 160ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .switch.on {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }
    .switch.on::after {
      left: 20px;
      background: #0a0a0a;
    }
    .switch:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    .switch:disabled {
      cursor: default;
      opacity: 0.6;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 18px;
    }
    .banner {
      margin-top: 16px;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .banner-error {
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }
    .banner-ok {
      border: 1px solid var(--nx-win);
      background: rgba(52, 199, 89, 0.08);
    }
    .add {
      margin-top: 6px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--nx-line);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .row:last-child {
      border-bottom: none;
    }
    .row-name {
      flex: 1;
      min-width: 0;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .off {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      font-weight: 500;
      margin-top: 2px;
    }
    @media (max-width: 860px) {
      .body {
        padding: 16px;
      }
      .tiers {
        grid-template-columns: 1fr;
      }
      .row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelAthletePricingComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly service = inject(AthletePricingService);

  protected readonly tiers = ATHLETE_PRICING_TIERS;
  protected readonly defaultLabel = ATHLETE_PRICING_DEFAULT_LABEL;
  protected readonly tierHint = ATHLETE_PRICING_TIER_HINT;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly readOnly = computed(() => !this.access.canWrite('promocoes'));

  /** Config gravada (ao vivo pelo doc da arena). */
  private readonly saved = computed(() => athletePricingFormFromArena(this.arenaContext.arenaDocData()));
  protected readonly form = signal<AthletePricingForm>(athletePricingFormFromArena(null));
  protected readonly dirty = computed(() => JSON.stringify(this.form()) !== JSON.stringify(this.saved()));
  protected readonly formError = computed(() => athletePricingFormError(this.form()));
  protected readonly savingConfig = signal(false);
  protected readonly configError = signal<string | null>(null);
  protected readonly configSaved = signal(false);

  protected readonly members = signal<AthletePricingMember[]>([]);
  protected readonly membersLoading = signal(true);
  protected readonly memberError = signal<string | null>(null);
  protected readonly filter = signal<'all' | AthletePricingTier>('all');
  protected readonly busyId = signal<string | null>(null);
  protected readonly filteredMembers = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.members() : this.members().filter((m) => m.tier === f);
  });

  protected readonly searchTerm = signal('');
  protected readonly searching = signal(false);
  protected readonly results = signal<AthleteSearchResult[]>([]);
  private searchSeq = 0;

  protected readonly subtitle = computed(() => {
    const parts = this.tiers
      .filter((t) => this.saved()[t].enabled)
      .map((t) => `${this.saved()[t].label}: ${athletePricingValueLabel(this.saved()[t]) ?? '—'}`);
    return parts.length ? `Avulso: preço da quadra · ${parts.join(' · ')}` : 'Desligado · todo mundo paga o preço da quadra';
  });

  constructor() {
    // Formulário segue a config gravada enquanto não houver edição pendente (o form ainda igual
    // à última config que ele recebeu) ou logo depois de salvar.
    let baseline = JSON.stringify(this.form());
    effect(() => {
      const saved = this.saved();
      untracked(() => {
        if (JSON.stringify(this.form()) === baseline || this.savingConfig()) this.form.set(saved);
        baseline = JSON.stringify(saved);
      });
    });

    const destroyRef = inject(DestroyRef);
    let stop: (() => void) | null = null;
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      stop?.();
      stop = null;
      if (!arenaId) return;
      this.membersLoading.set(true);
      stop = this.service.watchMembers(
        arenaId,
        (members) => {
          this.members.set(members);
          this.membersLoading.set(false);
        },
        (message) => {
          this.memberError.set(message);
          this.membersLoading.set(false);
        },
      );
    });
    destroyRef.onDestroy(() => stop?.());
  }

  protected tierLabel(tier: AthletePricingTier): string {
    return this.form()[tier].label.trim() || ATHLETE_PRICING_DEFAULT_LABEL[tier];
  }

  protected countOf(tier: AthletePricingTier): number {
    return this.members().filter((m) => m.tier === tier).length;
  }

  protected memberTierOf(athleteId: string): AthletePricingTier | null {
    return this.members().find((m) => m.athleteId === athleteId)?.tier ?? null;
  }

  protected patch(tier: AthletePricingTier, change: Partial<AthletePricingForm[AthletePricingTier]>): void {
    this.configSaved.set(false);
    this.form.update((f) => ({ ...f, [tier]: { ...f[tier], ...change } }));
  }

  protected setMode(tier: AthletePricingTier, mode: AthletePricingMode): void {
    if (this.form()[tier].mode === mode) return;
    this.patch(tier, { mode, value: '' });
  }

  protected async saveConfig(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.formError()) return;
    this.savingConfig.set(true);
    this.configError.set(null);
    try {
      await this.service.saveConfig(athletePricingPayload(arenaId, this.form()));
      this.configSaved.set(true);
    } catch (e) {
      this.configError.set((e as Error).message);
    } finally {
      this.savingConfig.set(false);
    }
  }

  protected async onSearch(term: string): Promise<void> {
    this.searchTerm.set(term);
    const seq = ++this.searchSeq;
    if (term.trim().length < 2) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    try {
      const found = await this.service.searchAccounts(term);
      if (seq === this.searchSeq) this.results.set(found);
    } catch {
      if (seq === this.searchSeq) this.results.set([]);
    } finally {
      if (seq === this.searchSeq) this.searching.set(false);
    }
  }

  protected async addMember(r: AthleteSearchResult, tier: AthletePricingTier): Promise<void> {
    await this.runMember(r.id, tier);
    if (!this.memberError()) {
      this.searchTerm.set('');
      this.results.set([]);
    }
  }

  protected changeTier(m: AthletePricingMember, tier: string): void {
    if (tier === m.tier || !(ATHLETE_PRICING_TIERS as readonly string[]).includes(tier)) return;
    void this.runMember(m.athleteId, tier as AthletePricingTier);
  }

  protected removeMember(m: AthletePricingMember): void {
    void this.runMember(m.athleteId, null);
  }

  private async runMember(athleteId: string, tier: AthletePricingTier | null): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    this.busyId.set(athleteId);
    this.memberError.set(null);
    try {
      await this.service.setMember(arenaId, athleteId, tier);
    } catch (e) {
      this.memberError.set((e as Error).message);
    } finally {
      this.busyId.set(null);
    }
  }
}
