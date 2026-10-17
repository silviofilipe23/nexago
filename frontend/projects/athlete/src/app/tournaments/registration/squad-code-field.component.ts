import { ChangeDetectionStrategy, Component, effect, input, model, signal, untracked } from '@angular/core';
import { athleteFunctions } from '../../data/functions';
import { TournamentRegistrationError, checkSquadCode } from '../../data/tournament-registrations-repository';
import { NxFieldErrorComponent } from '../../shared/feedback';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

/** Mesma checagem do servidor (`normalizeSquadCode`): evita ida e volta por erro de digitação. */
const CODE_RE = /^[A-Z0-9]{3,20}$/;

interface LinkReferral {
  name: string;
  pct: number;
}

/**
 * "Tem código de embaixador?" no checkout da inscrição. Confere com `checkSquadCode` antes de
 * cobrar e devolve ao pai o código aplicado (`code`) e o % de desconto (`discountPct`). Sem
 * código digitado, mostra a indicação que veio por link/QR — o desconto também vale para ela.
 * O servidor confere tudo de novo na cobrança; o que vale é o que ele aplicar.
 */
@Component({
  selector: 'app-squad-code-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NxFieldErrorComponent, NxSpinnerComponent],
  template: `
    @if (code(); as applied) {
      <div class="applied" role="status">
        <span>
          <strong>{{ applied }}</strong> · indicação de {{ ambassadorName() || 'embaixador' }}
          @if (discountPct() > 0) {
            · <b>{{ discountPct() }}% de desconto</b>
          }
        </span>
        <button type="button" class="link" [disabled]="disabled()" (click)="remove()">Remover</button>
      </div>
    } @else if (!open()) {
      @if (viaLink(); as ref) {
        <div class="applied" role="status">
          <span>
            Indicação de {{ ref.name }}
            @if (ref.pct > 0) {
              · <b>{{ ref.pct }}% de desconto</b>
            }
          </span>
          <button type="button" class="link" [disabled]="disabled()" (click)="open.set(true)">Tenho outro código</button>
        </div>
      } @else {
        <button type="button" class="link toggle" [disabled]="disabled()" (click)="open.set(true)">Tem código de embaixador?</button>
      }
    } @else {
      <label class="label" for="squad-code">Código de embaixador</label>
      <div class="row">
        <input
          id="squad-code"
          type="text"
          class="input"
          placeholder="Ex.: JOAO10"
          autocomplete="off"
          autocapitalize="characters"
          maxlength="20"
          [value]="draft()"
          [disabled]="disabled() || checking()"
          [class.nx-input--invalid]="message() !== null"
          [attr.aria-invalid]="message() !== null"
          (input)="onInput($any($event.target).value)"
          (keydown.enter)="apply()"
        />
        <button type="button" class="apply" [disabled]="disabled() || checking() || !draft()" (click)="apply()">
          @if (checking()) {
            <app-nx-spinner [size]="13" />
          }
          Aplicar
        </button>
      </div>
      @if (message(); as m) {
        <app-nx-field-error>{{ m }}</app-nx-field-error>
      }
    }
  `,
  styles: `
    :host { display: block; width: 100%; margin-bottom: 14px; }
    .label { display: block; margin-bottom: 8px; font-family: var(--nx-font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--nx-text-dim); }
    .row { display: flex; gap: 8px; }
    .input { flex: 1; min-width: 0; height: 42px; padding: 0 14px; box-sizing: border-box; border-radius: var(--nx-r-2, 10px); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font-family: var(--nx-font-mono); font-size: 13.5px; letter-spacing: 0.04em; text-transform: uppercase; }
    .input::placeholder { text-transform: none; letter-spacing: 0; }
    .input:focus { outline: none; border-color: rgba(255, 106, 26, 0.5); }
    .input.nx-input--invalid { border-color: var(--nx-live); }
    .apply { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 42px; padding: 0 16px; border-radius: var(--nx-r-2, 10px); border: 1px solid var(--nx-line-strong); background: transparent; color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; cursor: pointer; }
    .apply:disabled { opacity: 0.5; cursor: default; }
    .link { flex: none; padding: 0; border: none; background: none; color: var(--nx-orange-500); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; cursor: pointer; }
    .toggle { display: block; margin: 0 auto; }
    .applied { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: var(--nx-r-2, 10px); background: rgba(43, 209, 126, 0.08); border: 1px solid rgba(43, 209, 126, 0.3); font-size: 13px; color: var(--nx-text); }
    .applied strong { font-family: var(--nx-font-mono); letter-spacing: 0.04em; }
    .applied b { color: var(--nx-win); font-weight: 700; }
  `,
})
export class SquadCodeFieldComponent {
  /** Código aplicado (normalizado) ou vazio. */
  readonly code = model('');
  /** % de desconto do seguidor que vale agora (código aplicado ou link), para o pai mostrar o preço. */
  readonly discountPct = model(0);
  /** Atletas da inscrição: o servidor recusa o código de qualquer um deles (autoindicação). */
  readonly athleteUids = input<string[]>([]);
  /** Inscrição sendo paga: o desconto "só na primeira inscrição" é decidido por ela. */
  readonly registrationId = input<string | null>(null);
  readonly disabled = input(false);
  /** Erro que a cobrança devolveu para este campo (`details.field === 'squadCode'`). */
  readonly serverError = input<string | null>(null);

  protected readonly open = signal(false);
  protected readonly draft = signal('');
  protected readonly checking = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly ambassadorName = signal('');
  /** Indicação por link/QR guardada na conta (sem código digitado). */
  protected readonly viaLink = signal<LinkReferral | null>(null);
  private linkChecked = false;

  constructor() {
    // A cobrança recusou o código aplicado (ex.: contrato encerrado no meio): volta para o campo.
    effect(() => {
      const err = this.serverError();
      if (!err) return;
      // Só o erro dispara: ler `code` rastreado faria o próximo "Aplicar" cair aqui de novo.
      untracked(() => {
        this.draft.set(this.code() || this.draft());
        this.code.set('');
        this.discountPct.set(this.viaLink()?.pct ?? 0);
        this.open.set(true);
        this.message.set(err);
      });
    });
    // Indicação por link: uma consulta por checkout, assim que a inscrição é conhecida.
    effect(() => {
      const registrationId = this.registrationId();
      if (!registrationId || this.linkChecked) return;
      this.linkChecked = true;
      void untracked(() => this.loadLinkReferral(registrationId));
    });
  }

  private async loadLinkReferral(registrationId: string): Promise<void> {
    try {
      const result = await checkSquadCode(athleteFunctions(), '', this.athleteUids(), registrationId);
      if (result.origin !== 'link' && result.origin !== 'qr') return;
      this.viaLink.set({ name: result.ambassadorName ?? 'um embaixador', pct: result.discountPct });
      if (!this.code()) this.discountPct.set(result.discountPct);
    } catch {
      // Sem indicação visível: a cobrança resolve o link do mesmo jeito no servidor.
    }
  }

  protected onInput(value: string): void {
    this.draft.set(value.trim().toUpperCase());
    this.message.set(null);
  }

  protected async apply(): Promise<void> {
    const code = this.draft();
    if (!code || this.checking()) return;
    if (!CODE_RE.test(code)) {
      this.message.set('O código tem de 3 a 20 letras ou números, sem espaço.');
      return;
    }
    this.checking.set(true);
    try {
      const result = await checkSquadCode(athleteFunctions(), code, this.athleteUids(), this.registrationId() ?? '');
      this.ambassadorName.set(result.ambassadorName ?? 'um embaixador');
      this.code.set(result.code ?? code);
      this.discountPct.set(result.discountPct);
      this.message.set(null);
    } catch (err) {
      this.message.set(
        err instanceof TournamentRegistrationError ? err.message : 'Não deu para conferir o código agora. Tente de novo.',
      );
    } finally {
      this.checking.set(false);
    }
  }

  protected remove(): void {
    this.code.set('');
    this.draft.set('');
    this.discountPct.set(this.viaLink()?.pct ?? 0);
    this.open.set(this.viaLink() === null);
  }
}
