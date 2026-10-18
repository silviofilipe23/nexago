import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { NumFieldComponent } from '../../../squad/niveis-regras/ui/num-field.component';
import {
  CANCEL_LABEL,
  CANCEL_POLICIES,
  COMMISSION_PCT,
  LIMITS,
  PLAN_STATUSES,
  STATUS_LABEL,
  brl,
  toCents,
  type Issues,
  type PlanStatus,
  type TournamentPlan,
} from '../data/tournament-plans';
import { SegComponent } from '../ui/seg.component';
import { StepperComponent } from './stepper.component';

/** Seções 01–05 do editor. Emite o plano inteiro a cada mudança; a validação é do pai. */
@Component({
  selector: 'bo-plan-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PillComponent, ToggleComponent, NumFieldComponent, SegComponent, StepperComponent],
  template: `
    @let p = plan();
    <section class="sec">
      <header><span class="n">01</span><div><h2>Identidade</h2><p>Como o plano aparece para o organizador</p></div></header>
      <div class="g2">
        <label class="f">
          <span class="lbl">Nome do plano</span>
          <input class="bo-input" [value]="p.name" [disabled]="readonly()" [attr.aria-invalid]="!!err('name')" (input)="patch({ name: text($event) })" />
          @if (err('name'); as e) { <span class="err">{{ e }}</span> }
        </label>
        <div class="f">
          <span class="lbl">Status</span>
          <bo-seg label="Status" [options]="statusOptions" [value]="p.status" [disabled]="readonly()" (valueChange)="patch({ status: $event })" />
          <span class="hint">{{ statusHint() }}</span>
        </div>
      </div>
      <label class="f mt">
        <span class="lbl">Descrição curta</span>
        <input class="bo-input" [value]="p.description" [disabled]="readonly()" [attr.aria-invalid]="!!err('description')" (input)="patch({ description: text($event) })" />
        <span class="hint" [class.err]="!!err('description')">{{ p.description.trim().length }}/{{ limits.descMax }} caracteres</span>
      </label>
    </section>

    <section class="sec">
      <header><span class="n">02</span><div><h2>Estrutura do serviço</h2><p>O que a NexaGO entrega no dia do evento</p></div></header>
      <div class="row">
        <div class="t"><strong>Quadras</strong><span>Cada quadra soma o custo operacional da estrutura financeira.</span></div>
        <bo-stepper label="Quadras" [value]="p.courts" [min]="1" [max]="limits.courts" [disabled]="readonly()" (valueChange)="patch({ courts: $event })" />
      </div>
      <div class="row">
        <div class="t"><strong>Árbitros por quadra</strong><span>Total no evento: {{ p.courts * p.refsPerCourt }} árbitros</span></div>
        <bo-stepper label="Árbitros por quadra" [value]="p.refsPerCourt" [min]="0" [max]="limits.refsPerCourt" [disabled]="readonly()" (valueChange)="patch({ refsPerCourt: $event })" />
      </div>
      <div class="row">
        <div class="t"><strong>Transmissão ao vivo</strong><span>Só na quadra principal, independentemente da quantidade de quadras. Sem ela, não há cota Sponsors.</span></div>
        <bo-toggle ariaLabel="Transmissão ao vivo" [checked]="p.live" [disabled]="readonly()" (checkedChange)="patch({ live: $event })" />
      </div>
      <div class="row">
        <div class="t"><strong>Narrador</strong><span>{{ p.live ? 'Narra a quadra principal. Necessário para as menções do Sponsors Ouro.' : 'Requer transmissão ao vivo.' }}</span></div>
        <bo-toggle ariaLabel="Narrador" [checked]="p.live && p.narrator" [disabled]="readonly() || !p.live" (checkedChange)="patch({ narrator: $event })" />
      </div>
      <div class="row">
        <div class="t"><strong>Cobertura máxima</strong><span>Duração do evento com equipe, arbitragem e transmissão.</span></div>
        <bo-stepper label="Cobertura máxima" suffix="h" [value]="p.hours" [min]="limits.hoursMin" [max]="limits.hoursMax" [disabled]="readonly()" (valueChange)="patch({ hours: $event })" />
      </div>
      <div class="row last">
        <div class="t"><strong>Hora extra</strong><span>Cobrada se o evento passar da cobertura. 0 desativa.</span>
          @if (err('extraHourCents'); as e) { <span class="err">{{ e }}</span> }
        </div>
        <bo-num-field class="w150" label="Hora extra" prefix="R$" suffix="/h" [value]="p.extraHourCents / 100" [invalid]="!!err('extraHourCents')" [disabled]="readonly()" (valueChange)="money('extraHourCents', $event)" />
      </div>
    </section>

    <section class="sec">
      <header><span class="n">03</span><div><h2>Preço e pagamento</h2><p>Valor do pacote, cobrado por evento</p></div></header>
      <div class="g3">
        <div class="f">
          <span class="lbl">Preço por evento</span>
          <bo-num-field label="Preço por evento" prefix="R$" [value]="p.priceCents / 100" [invalid]="!!err('priceCents')" [disabled]="readonly()" (valueChange)="money('priceCents', $event)" />
          @if (err('priceCents'); as e) { <span class="err">{{ e }}</span> }
        </div>
        <div class="f">
          <span class="lbl">Sinal na contratação</span>
          <bo-num-field label="Sinal na contratação" suffix="%" [value]="p.depositPct" [invalid]="!!err('depositPct')" [disabled]="readonly()" (valueChange)="whole('depositPct', $event)" />
          <span class="hint" [class.err]="!!err('depositPct')">{{ err('depositPct') ?? depositHint() }}</span>
        </div>
        <div class="f">
          <span class="lbl">Saldo até</span>
          <bo-num-field label="Saldo até" suffix="dias antes" [value]="p.balanceDays" [invalid]="!!err('balanceDays')" [disabled]="readonly()" (valueChange)="whole('balanceDays', $event)" />
          @if (err('balanceDays'); as e) { <span class="err">{{ e }}</span> }
        </div>
      </div>
      <div class="f mt">
        <span class="lbl">Cancelamento pelo organizador</span>
        <bo-seg label="Cancelamento pelo organizador" [options]="cancelOptions" [value]="p.cancelPolicy" [disabled]="readonly()" (valueChange)="patch({ cancelPolicy: $event })" />
      </div>
    </section>

    <section class="sec">
      <header>
        <span class="n">04</span><div><h2>Inscrições e comissão</h2><p>Regras gerais, iguais para todos os planos</p></div>
      </header>
      <div class="row">
        <div class="t"><strong>Inscrições exclusivas pela NexaGO <bo-icon name="lock" [size]="12" /></strong><span>Obrigatório para contratar qualquer plano.</span></div>
        <bo-pill tone="dim">Obrigatório</bo-pill>
      </div>
      <div class="row last">
        <div class="t"><strong>Comissão de {{ commission }}% sobre inscrições <bo-icon name="lock" [size]="12" /></strong><span>Taxa da plataforma, cobrada além do valor do plano. Negociável no cadastro do organizador.</span></div>
        <bo-pill tone="dim">{{ commission }}%</bo-pill>
      </div>
    </section>

    <section class="sec">
      <header><span class="n">05</span><div><h2>Disponibilidade</h2><p>Onde e quando o plano pode ser contratado</p></div></header>
      <div class="g2">
        <div class="f">
          <span class="lbl">Antecedência mínima</span>
          <bo-num-field label="Antecedência mínima" suffix="dias" [value]="p.leadDays" [invalid]="!!err('leadDays')" [disabled]="readonly()" (valueChange)="whole('leadDays', $event)" />
          <span class="hint" [class.err]="!!err('leadDays')">{{ err('leadDays') ?? 'Para escalar equipe e arbitragem' }}</span>
        </div>
        <div class="f">
          <span class="lbl">Máx. eventos no mesmo dia</span>
          <bo-num-field label="Máx. eventos no mesmo dia" [value]="p.maxPerDay" [invalid]="!!err('maxPerDay')" [disabled]="readonly()" (valueChange)="whole('maxPerDay', $event)" />
          <span class="hint" [class.err]="!!err('maxPerDay')">{{ err('maxPerDay') ?? 'Limite da equipe de transmissão' }}</span>
        </div>
      </div>
      <div class="f mt">
        <span class="lbl">Cidades atendidas</span>
        <div class="chips">
          @for (c of cityChips(); track c) {
            <button type="button" class="bo-chip" [class.active]="p.cities.includes(c)" [attr.aria-pressed]="p.cities.includes(c)" [disabled]="readonly()" (click)="toggleCity(c)">{{ c }}</button>
          }
        </div>
        @if (!readonly()) {
          <form class="add" (submit)="addCity($event)">
            <input class="bo-input" placeholder="Outra cidade" aria-label="Adicionar cidade" maxlength="60" [value]="newCity()" (input)="newCity.set(text($event))" />
            <button type="submit" class="bo-mini-btn" [disabled]="newCity().trim().length < 2"><bo-icon name="plus" [size]="13" /> Adicionar</button>
          </form>
        }
        <span class="hint">{{ p.cities.length ? p.cities.length + ' selecionada' + (p.cities.length > 1 ? 's' : '') : 'Nenhuma cidade selecionada.' }}</span>
      </div>
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .sec { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); padding: 20px 22px; }
    .sec > header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
    .n { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; color: var(--nx-orange-500); padding-top: 2px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; }
    header p { margin: 2px 0 0; font-size: 12px; color: var(--nx-text-dim); }
    .g2, .g3 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .g3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .f { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .mt { margin-top: 14px; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .err, .hint.err { font-size: 11.5px; color: var(--nx-live); }
    .bo-input[aria-invalid='true'] { border-color: rgba(255, 59, 48, 0.7); }
    .row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .row.last { border-bottom: none; }
    .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .t strong { display: flex; align-items: center; gap: 7px; font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .t strong bo-icon { color: var(--nx-text-dim); display: inline-flex; }
    .t span { font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    .w150 { width: 150px; flex: none; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .add { display: flex; gap: 8px; max-width: 360px; }
    .add .bo-input { height: 34px; }
    .add button { flex: none; height: 34px; }
    @media (max-width: 760px) {
      .g2, .g3 { grid-template-columns: minmax(0, 1fr); }
      .row { flex-wrap: wrap; }
    }
  `,
})
export class PlanFormComponent {
  readonly plan = input.required<TournamentPlan>();
  readonly issues = input<Issues>({});
  readonly readonly = input(false);
  /** Cidades de todos os planos, para virar chip sem digitar. */
  readonly knownCities = input<readonly string[]>([]);

  readonly planChange = output<TournamentPlan>();

  protected readonly limits = LIMITS;
  protected readonly commission = COMMISSION_PCT;
  protected readonly statusOptions = PLAN_STATUSES.map((s) => [s, STATUS_LABEL[s]] as const);
  protected readonly cancelOptions = CANCEL_POLICIES.map((c) => [c, CANCEL_LABEL[c]] as const);
  protected readonly newCity = signal('');

  protected readonly statusHint = computed(() => STATUS_HINT[this.plan().status]);
  protected readonly depositHint = computed(() => {
    const p = this.plan();
    return `${brl(Math.round((p.priceCents * p.depositPct) / 100))} para reservar a data`;
  });
  protected readonly cityChips = computed(() => {
    const out: string[] = [];
    for (const c of [...this.plan().cities, ...this.knownCities()]) {
      if (!out.some((x) => x.toLowerCase() === c.toLowerCase())) {
        out.push(c);
      }
    }
    return out;
  });

  protected err(key: string): string | null {
    return this.issues()[key] ?? null;
  }

  protected patch(patch: Partial<TournamentPlan>): void {
    this.planChange.emit({ ...this.plan(), ...patch });
  }

  protected money(key: 'priceCents' | 'extraHourCents', v: unknown): void {
    this.patch({ [key]: toCents(typeof v === 'number' ? v : NaN) });
  }

  protected whole(key: 'depositPct' | 'balanceDays' | 'leadDays' | 'maxPerDay', v: unknown): void {
    this.patch({ [key]: typeof v === 'number' ? v : NaN });
  }

  protected toggleCity(city: string): void {
    const cities = this.plan().cities;
    this.patch({ cities: cities.includes(city) ? cities.filter((c) => c !== city) : [...cities, city] });
  }

  protected addCity(event: Event): void {
    event.preventDefault();
    const city = this.newCity().trim().replace(/\s+/g, ' ');
    if (city.length < 2) {
      return;
    }
    const cities = this.plan().cities;
    if (!cities.some((c) => c.toLowerCase() === city.toLowerCase())) {
      this.patch({ cities: [...cities, city] });
    }
    this.newCity.set('');
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}

const STATUS_HINT: Record<PlanStatus, string> = {
  ativo: 'Aparece para o organizador contratar.',
  oculto: 'Some da vitrine; contratos existentes seguem valendo.',
  rascunho: 'Em preparação: fica fora da vitrine e das contas.',
};

