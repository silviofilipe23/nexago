import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { NumFieldComponent } from '../../../squad/niveis-regras/ui/num-field.component';
import { brl, toCents, type Issues, type SponsorTier } from '../../planos/data/tournament-plans';

const COLORS = ['#C98A5A', '#C9CDD4', '#F4C543', '#5AC8FA', '#2BD17E', '#FF6A1A'];

/** Uma cota (Bronze, Prata, Ouro…): preço, aparições, menções e máximo por evento. */
@Component({
  selector: 'bo-sponsor-tier-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ToggleComponent, NumFieldComponent],
  template: `
    @let t = tier();
    <article class="card" [style.border-top-color]="t.color">
      <div class="top">
        <input class="name" [style.color]="t.color" [value]="t.name" [disabled]="readonly()" [attr.aria-label]="'Nome da cota ' + t.name" [attr.aria-invalid]="!!err('name')" (input)="patch({ name: text($event) })" />
        <span class="sale">À venda</span>
        <bo-toggle [ariaLabel]="'Cota ' + t.name + ' à venda'" [checked]="t.onSale" [disabled]="readonly()" (checkedChange)="patch({ onSale: $event })" />
      </div>
      @if (err('name'); as e) { <span class="err">{{ e }}</span> }
      <div class="f">
        <span class="lbl">Preço por evento</span>
        <bo-num-field [label]="'Preço da cota ' + t.name" prefix="R$" [value]="t.priceCents / 100" [invalid]="!!err('priceCents')" [disabled]="readonly()" (valueChange)="money($event)" />
      </div>
      <div class="g2">
        <div class="f">
          <span class="lbl">Aparições da logo</span>
          <bo-num-field [label]="'Aparições da cota ' + t.name" [value]="t.appearances" [invalid]="!!err('appearances')" [disabled]="readonly()" (valueChange)="whole('appearances', $event)" />
        </div>
        <div class="f">
          <span class="lbl">Segundos cada</span>
          <bo-num-field [label]="'Segundos por aparição da cota ' + t.name" suffix="s" [value]="t.seconds" [invalid]="!!err('seconds')" [disabled]="readonly()" (valueChange)="whole('seconds', $event)" />
        </div>
        <div class="f">
          <span class="lbl">Menções do narrador</span>
          <bo-num-field [label]="'Menções da cota ' + t.name" [value]="t.mentions" [invalid]="!!err('mentions')" [disabled]="readonly()" (valueChange)="whole('mentions', $event)" />
        </div>
        <div class="f">
          <span class="lbl">Máx. cotas por evento</span>
          <bo-num-field [label]="'Máximo por evento da cota ' + t.name" [value]="t.maxPerEvent" [invalid]="!!err('maxPerEvent')" [disabled]="readonly()" (valueChange)="whole('maxPerEvent', $event)" />
        </div>
      </div>
      @if (firstError(); as e) { <span class="err">{{ e }}</span> }
      @if (narratorWarning(); as w) { <span class="warn">{{ w }}</span> }
      <div class="stats">
        <div><span>Tempo de tela</span><b>{{ screen() }}</b></div>
        <div><span>Custo por aparição</span><b>{{ perAppearance() }}</b></div>
      </div>
      <div class="foot">
        @if (!readonly()) {
          <div class="colors" role="radiogroup" [attr.aria-label]="'Cor da cota ' + t.name">
            @for (c of colors; track c) {
              <button type="button" role="radio" [attr.aria-checked]="t.color === c" [attr.aria-label]="'Cor ' + c" [class.on]="t.color === c" [style.background]="c" (click)="patch({ color: c })"></button>
            }
          </div>
          @if (removable()) {
            <button type="button" class="bo-ghost-btn danger" (click)="remove.emit()"><bo-icon name="trash" [size]="13" /> Remover</button>
          }
        }
      </div>
    </article>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .card { height: 100%; box-sizing: border-box; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-top: 3px solid; border-radius: var(--nx-r-4); padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; align-items: center; gap: 10px; }
    .name { flex: 1; min-width: 0; padding: 2px 4px; margin-left: -4px; border: 1px solid transparent; border-radius: 6px; background: transparent; font-family: var(--nx-font-display); font-weight: 800; font-size: 17px; }
    .name:hover:not(:disabled), .name:focus { border-color: var(--nx-line-strong); outline: none; }
    .sale { font-size: 11.5px; color: var(--nx-text-dim); }
    .f { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .err { font-size: 11.5px; color: var(--nx-live); }
    .warn { font-size: 11.5px; color: var(--nx-pending); }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--nx-line); border-radius: var(--nx-r-2); overflow: hidden; }
    .stats div { background: var(--nx-surface-1); padding: 9px 11px; display: flex; flex-direction: column; gap: 3px; }
    .stats span { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .stats b { font-family: var(--nx-font-mono); font-size: 13px; }
    .foot { display: flex; align-items: center; gap: 8px; margin-top: auto; min-height: 24px; }
    .colors { flex: 1; display: flex; gap: 6px; }
    .colors button { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
    .colors button.on { border-color: var(--nx-text); }
  `,
})
export class SponsorTierCardComponent {
  readonly tier = input.required<SponsorTier>();
  /** Erros desta cota, sem o prefixo `tiers.N.`. */
  readonly issues = input<Issues>({});
  readonly readonly = input(false);
  readonly removable = input(false);
  /** Planos ativos com transmissão e sem narrador (as menções não acontecem neles). */
  readonly plansWithoutNarrator = input<readonly string[]>([]);

  readonly tierChange = output<SponsorTier>();
  readonly remove = output<void>();

  protected readonly colors = COLORS;

  protected readonly screen = computed(() => {
    const total = this.tier().appearances * this.tier().seconds;
    return Number.isFinite(total) ? `${Math.floor(total / 60)}min ${total % 60}s` : '—';
  });
  protected readonly perAppearance = computed(() => {
    const t = this.tier();
    return t.appearances > 0 ? brl(Math.round(t.priceCents / t.appearances), 2) : '—';
  });
  protected readonly firstError = computed(() => {
    const i = this.issues();
    return i['priceCents'] ?? i['appearances'] ?? i['seconds'] ?? i['mentions'] ?? i['maxPerEvent'] ?? null;
  });
  protected readonly narratorWarning = computed(() => {
    const list = this.plansWithoutNarrator();
    if (!(this.tier().mentions > 0) || list.length === 0) {
      return null;
    }
    return `Menções exigem narrador. ${list.join(', ')} ${list.length > 1 ? 'não têm' : 'não tem'}.`;
  });

  protected err(key: string): string | null {
    return this.issues()[key] ?? null;
  }

  protected patch(patch: Partial<SponsorTier>): void {
    this.tierChange.emit({ ...this.tier(), ...patch });
  }

  protected money(v: unknown): void {
    this.patch({ priceCents: toCents(typeof v === 'number' ? v : NaN) });
  }

  protected whole(key: 'appearances' | 'seconds' | 'mentions' | 'maxPerEvent', v: unknown): void {
    this.patch({ [key]: typeof v === 'number' ? v : NaN });
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
