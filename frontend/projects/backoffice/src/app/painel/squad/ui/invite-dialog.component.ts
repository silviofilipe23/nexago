import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { dateLabel } from '../embaixadores/data/ambassador';
import { SQUAD_TIERS, TIER_LABELS, versionLabel, type SquadRules, type SquadTier } from '../niveis-regras/data/squad-rules';
import { packageSummary } from '../data/package-summary';
import { CODE_MAX, isValidCode, nextCycleStart, normalizeCode, suggestedCodeFor, type Cycle } from '../data/squad-program';
import {
  SquadProgramRepository,
  type AthleteOption,
  type Contract,
  type SendInviteInput,
} from '../data/squad-program.repository';
import { dayMonthOfKey, spDateKey } from '../comissoes/data/commission';

/** Atleta já escolhido (convite a partir de uma candidatura). */
export interface PresetAthlete {
  uid: string;
  name: string;
  applicationId: string;
  suggestedTier: SquadTier;
}

/**
 * Modal "Convidar atleta": conta NexaGO existente, nível com o resumo do pacote vigente, comissão
 * (só Pro), código sugerido, período e mensagem. Com o piloto cheio vira "Agendar convite".
 */
@Component({
  selector: 'bo-invite-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, IconComponent],
  template: `
    <bo-confirm-dialog
      [open]="open()"
      title="Convidar atleta"
      [description]="pilotFull() ? '' : 'O atleta recebe push e o convite no app (06 · Convite recebido).'"
      [confirmLabel]="pilotFull() ? 'Agendar convite' : 'Enviar convite'"
      size="md"
      [busy]="busy()"
      [confirmDisabled]="!valid()"
      [error]="error()"
      (confirmed)="submit()"
      (dismissed)="dismissed.emit()"
    >
      @if (pilotFull()) {
        <div class="full" role="note">
          <bo-icon name="clock" [size]="15" />
          <span>Vagas preenchidas · o convite entra para o próximo ciclo ({{ nextCycle() }}).</span>
        </div>
      }

      <div class="field">
        <span>Atleta</span>
        @if (athlete(); as a) {
          <div class="picked">
            <strong>{{ a.name }}</strong>
            @if (a.email) {
              <span>{{ a.email }}</span>
            }
            @if (!preset()) {
              <button type="button" class="link" (click)="clearAthlete()">Trocar</button>
            }
          </div>
        } @else {
          <input class="bo-input" type="search" placeholder="Buscar por nome ou e-mail" aria-label="Buscar atleta"
            [value]="term()" (input)="onSearch($event)" />
          @if (searching()) {
            <span class="muted">Buscando…</span>
          } @else if (searchError()) {
            <span class="err">{{ searchError() }}</span>
          } @else if (results().length > 0) {
            <ul class="results">
              @for (r of results(); track r.uid) {
                <li><button type="button" (click)="pickAthlete(r)"><strong>{{ r.name }}</strong><span>{{ r.email }}</span></button></li>
              }
            </ul>
          } @else if (term().trim().length >= 2) {
            <span class="muted">Nenhuma conta encontrada.</span>
          }
        }
        @if (blocked(); as b) {
          <span class="err" role="alert">{{ b }}</span>
        }
      </div>

      <div class="grid">
        <label class="field">
          <span>Nível</span>
          <select class="bo-input" (change)="tier.set(asTier($event))">
            @for (t of tiers; track t) {
              <option [value]="t" [selected]="tier() === t">{{ tierLabels[t] }}{{ preset()?.suggestedTier === t ? ' · sugestão' : '' }}</option>
            }
          </select>
        </label>
        @if (proRange(); as range) {
          <label class="field">
            <span>Comissão ({{ range[0] }}–{{ range[1] }}%)</span>
            <input class="bo-input mono" type="number" [min]="range[0]" [max]="range[1]" step="0.5" [value]="pct()" (input)="pct.set(num($event))" />
          </label>
        }
      </div>
      <dl class="pkg" [attr.aria-label]="'Pacote ' + tierLabels[tier()] + ' nas regras ' + version()">
        @for (item of summary(); track item.label) {
          <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
        }
        <dt>Regras</dt><dd class="mono">{{ version() }}</dd>
      </dl>

      <label class="field">
        <span>Código sugerido</span>
        <input class="bo-input mono code" [attr.maxlength]="codeMax" [value]="code()" (input)="code.set(normalize($event))" />
        <span class="muted" [class.err]="code() !== '' && !codeOk()">A–Z e 0–9, de 4 a 12 caracteres. O atleta pode editar no aceite.</span>
      </label>

      <div class="grid">
        <label class="field">
          <span>Início</span>
          <input class="bo-input" type="date" [min]="today()" [value]="start()" (input)="start.set(text($event))" />
          <span class="muted">Vazio = data do aceite</span>
        </label>
        <label class="field">
          <span>Fim</span>
          <input class="bo-input" type="date" [min]="start() || today()" [value]="end()" (input)="end.set(text($event))" />
          <span class="muted">Padrão: fim do ciclo</span>
        </label>
      </div>

      <label class="field">
        <span>Mensagem pessoal (opcional)</span>
        <textarea class="bo-input" rows="3" maxlength="500" placeholder="Aparece no convite do app" [value]="message()" (input)="message.set(text($event))"></textarea>
      </label>
    </bo-confirm-dialog>
  `,
  styles: `
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; font-size: 12px; color: var(--nx-text-mute); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
    textarea.bo-input { height: auto; padding: 10px 12px; resize: vertical; }
    input[type='date'] { color-scheme: dark; }
    .mono { font-family: var(--nx-font-mono); }
    .code { letter-spacing: 0.08em; font-weight: 600; }
    .muted { font-size: 11.5px; color: var(--nx-text-dim); }
    .err { font-size: 12px; color: var(--nx-live); }
    .full { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; padding: 10px 12px; border-radius: var(--nx-r-2); border: 1px solid rgba(244, 197, 67, 0.4); background: rgba(244, 197, 67, 0.08); color: var(--nx-pending); font-size: 12.5px; }
    .picked { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); }
    .picked strong { font-family: var(--nx-font-display); font-size: 14px; color: var(--nx-text); }
    .picked span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: var(--nx-text-dim); }
    .link { border: none; background: none; color: var(--nx-orange-500); font-size: 12.5px; cursor: pointer; }
    .results { margin: 0; padding: 4px; list-style: none; max-height: 200px; overflow-y: auto; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .results button { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 10px; border: none; border-radius: var(--nx-r-2); background: none; color: var(--nx-text); text-align: left; cursor: pointer; }
    .results button:hover { background: var(--nx-surface-2); }
    .results strong { font-size: 13px; }
    .results span { font-size: 11.5px; color: var(--nx-text-dim); }
    .pkg { margin: 0 0 14px; padding: 12px 14px; display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 6px 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); font-size: 12.5px; }
    dt { color: var(--nx-text-dim); }
    dd { margin: 0; color: var(--nx-text); }
    @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class InviteDialogComponent {
  private readonly repo = inject(SquadProgramRepository);

  readonly open = input(false);
  readonly rules = input.required<SquadRules>();
  readonly rulesVersion = input(1);
  readonly cycle = input.required<Cycle>();
  readonly pilotFull = input(false);
  /** Contratos conhecidos, para bloquear quem já é embaixador antes de chamar o servidor. */
  readonly contracts = input<Contract[]>([]);
  readonly preset = input<PresetAthlete | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly now = input.required<Date>();

  readonly submitted = output<SendInviteInput>();
  readonly dismissed = output<void>();

  protected readonly tiers = SQUAD_TIERS;
  protected readonly tierLabels = TIER_LABELS;
  protected readonly codeMax = CODE_MAX;

  protected readonly term = signal('');
  protected readonly results = signal<AthleteOption[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchError = signal<string | null>(null);
  protected readonly athlete = signal<AthleteOption | null>(null);
  protected readonly tier = signal<SquadTier>('ath');
  protected readonly pct = signal<number | null>(null);
  protected readonly code = signal('');
  protected readonly start = signal('');
  protected readonly end = signal('');
  protected readonly message = signal('');
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private searchSeq = 0;

  protected readonly today = computed(() => spDateKey(this.now()));
  protected readonly nextCycle = computed(() => dayMonthOfKey(nextCycleStart(this.cycle())));
  protected readonly version = computed(() => versionLabel(this.rulesVersion()));
  protected readonly summary = computed(() => packageSummary(this.rules().tiers[this.tier()]));
  protected readonly proRange = computed(() => {
    const c = this.rules().tiers.pro.commissionPct;
    return this.tier() === 'pro' && Array.isArray(c) ? c : null;
  });
  protected readonly codeOk = computed(() => isValidCode(this.code()));

  /** "{nome} já é {nível} até {data}". */
  protected readonly blocked = computed(() => {
    const a = this.athlete();
    if (!a) return null;
    const c = this.contracts().find((x) => x.uid === a.uid && x.state !== 'ended');
    if (!c) return null;
    const until = c.end ? ` até ${dateLabel(c.end)}` : '';
    return `${a.name} já é ${TIER_LABELS[c.tier]}${until}.`;
  });

  protected readonly valid = computed(() => {
    const range = this.proRange();
    const pct = this.pct();
    return (
      !!this.athlete() &&
      !this.blocked() &&
      this.codeOk() &&
      (!range || (pct !== null && pct >= range[0] && pct <= range[1])) &&
      (!this.start() || this.start() >= this.today()) &&
      (!this.end() || this.end() > (this.start() || this.today()))
    );
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.debounce));
    effect(() => {
      if (!this.open()) return;
      const preset = this.preset();
      untracked(() => this.reset(preset));
    });
  }

  private reset(preset: PresetAthlete | null): void {
    this.term.set('');
    this.results.set([]);
    this.searchError.set(null);
    this.athlete.set(preset ? { uid: preset.uid, name: preset.name, email: null } : null);
    this.tier.set(preset?.suggestedTier ?? 'ath');
    const range = this.rules().tiers.pro.commissionPct;
    this.pct.set(Array.isArray(range) ? range[0] : null);
    this.code.set(preset ? suggestedCodeFor(preset.name) : '');
    this.start.set('');
    this.end.set(this.cycle().end);
    this.message.set('');
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.term.set(value);
    clearTimeout(this.debounce);
    if (value.trim().length < 2) {
      this.results.set([]);
      return;
    }
    this.debounce = setTimeout(() => void this.search(value.trim()), 300);
  }

  private async search(term: string): Promise<void> {
    const seq = ++this.searchSeq;
    this.searching.set(true);
    this.searchError.set(null);
    try {
      const rows = await this.repo.searchAthletes(term);
      if (seq === this.searchSeq) this.results.set(rows);
    } catch (error) {
      if (seq === this.searchSeq) this.searchError.set(callableErrorMessage(error));
    } finally {
      if (seq === this.searchSeq) this.searching.set(false);
    }
  }

  protected pickAthlete(a: AthleteOption): void {
    this.athlete.set(a);
    this.code.set(suggestedCodeFor(a.name));
  }

  protected clearAthlete(): void {
    this.athlete.set(null);
  }

  protected submit(): void {
    const a = this.athlete();
    if (!a || !this.valid()) return;
    this.submitted.emit({
      athleteId: a.uid,
      applicationId: this.preset()?.applicationId ?? null,
      tier: this.tier(),
      commissionPct: this.proRange() ? this.pct() : null,
      suggestedCode: this.code(),
      periodStart: this.start() || null,
      periodEnd: this.end() || null,
      message: this.message().trim() || null,
    });
  }

  protected normalize(event: Event): string {
    const el = event.target as HTMLInputElement;
    const v = normalizeCode(el.value).replace(/[^A-Z0-9]/g, '');
    el.value = v;
    return v;
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected num(event: Event): number | null {
    const v = (event.target as HTMLInputElement).valueAsNumber;
    return Number.isFinite(v) ? v : null;
  }

  protected asTier(event: Event): SquadTier {
    return (event.target as HTMLSelectElement).value as SquadTier;
  }
}
