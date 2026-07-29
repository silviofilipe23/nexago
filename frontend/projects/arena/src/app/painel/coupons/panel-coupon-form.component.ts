import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { inputValueToIso } from './coupon.model';
import { createArenaCoupon } from './coupons-repository';

type DiscountKind = 'percent' | 'fixed';

function parseNumber(raw: string): number {
  return Number(raw.replace(',', '.')) || 0;
}

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '');
}

/** Tela Novo cupom: só criação — o backend não expõe callable de edição (`createArenaCoupon`
 *  apenas). Desativar é feito na lista. Código é normalizado no servidor também; a UI já
 *  força maiúsculas pra combinar com o que vai ser salvo. */
@Component({
  selector: 'ar-panel-coupon-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Novo cupom" subtitle="Código de desconto que o cliente digita na reserva">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave() || saving()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Criando…' : 'Criar cupom' }}
        </button>
      </ar-page-header>

      <div class="body">
        <div class="col-left">
          @if (errorMessage(); as err) {
            <div class="error-banner">{{ err }}</div>
          }

          <ar-panel-card title="Código">
            <div class="field-label">Código do cupom</div>
            <input
              type="text"
              class="input-box code-input"
              placeholder="Ex.: VERAO10"
              [value]="code()"
              (input)="code.set(normalizeCode($any($event.target).value))"
            />
            <p class="hint">Mínimo 3 caracteres. Sempre salvo em maiúsculas, sem espaços.</p>
          </ar-panel-card>

          <ar-panel-card title="Desconto">
            <div class="type-toggle">
              <button type="button" class="type-btn" [class.active]="discountKind() === 'percent'" (click)="discountKind.set('percent')">% Percentual</button>
              <button type="button" class="type-btn" [class.active]="discountKind() === 'fixed'" (click)="discountKind.set('fixed')">R$ Valor fixo</button>
            </div>

            <div class="field-label">{{ discountKind() === 'percent' ? 'Desconto (%)' : 'Valor de desconto (R$)' }}</div>
            <input type="text" inputmode="decimal" class="input-box" [value]="discountValue()" (input)="discountValue.set($any($event.target).value)" />
            <p class="hint">Cupom e promoção automática não acumulam — vale sempre o maior desconto pro cliente.</p>
          </ar-panel-card>

          <ar-panel-card title="Vigência (opcional)">
            <div class="row-2">
              <div>
                <div class="field-label">Início</div>
                <input type="date" class="input-box" [value]="validFrom()" (input)="validFrom.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Fim</div>
                <input type="date" class="input-box" [value]="validUntil()" (input)="validUntil.set($any($event.target).value)" />
              </div>
            </div>
            <p class="hint">Sem datas = cupom vale a partir de agora, sem prazo pra expirar.</p>
          </ar-panel-card>

          <ar-panel-card title="Limite de usos">
            <div class="row-2">
              <div>
                <div class="field-label">Total de resgates (opcional)</div>
                <input type="text" inputmode="numeric" class="input-box" placeholder="Sem limite" [value]="maxTotal()" (input)="maxTotal.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Por atleta</div>
                <input type="text" inputmode="numeric" class="input-box" [value]="maxPerAthlete()" (input)="maxPerAthlete.set($any($event.target).value)" />
              </div>
            </div>
          </ar-panel-card>
        </div>

        <div class="col-right">
          <ar-panel-card title="Resumo">
            <div class="resumo-name">{{ code() || 'CÓDIGO' }}</div>
            <div class="resumo-highlight">
              <div class="field-label tone-orange">Desconto aplicado</div>
              <div class="resumo-value">{{ discountKind() === 'percent' ? discountValue() + '%' : 'R$ ' + discountValue() }}</div>
              <div class="resumo-usage">Até {{ maxPerAthlete() || '1' }}x por atleta{{ maxTotal() ? ' · ' + maxTotal() + ' resgates no total' : '' }}</div>
            </div>
          </ar-panel-card>

          <div class="hint-box">O cliente digita o código na tela de reserva da quadra; o desconto entra automaticamente na cotação.</div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 16px;
      align-items: start;
      overflow: auto;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .field-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .code-input {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .type-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }

    .type-btn {
      height: 52px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .type-btn:hover {
      background: var(--nx-surface-2);
    }

    .type-btn.active {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .resumo-name {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      letter-spacing: 0.06em;
      color: var(--nx-text);
      margin-bottom: 16px;
    }

    .resumo-highlight {
      padding: 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
    }

    .resumo-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
      color: var(--nx-orange-500);
      margin-top: 4px;
    }

    .resumo-usage {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 8px;
    }

    .hint-box {
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-dim);
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .row-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelCouponFormComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  protected readonly normalizeCode = normalizeCode;

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly code = signal('');
  protected readonly discountKind = signal<DiscountKind>('percent');
  protected readonly discountValue = signal('10');
  protected readonly validFrom = signal('');
  protected readonly validUntil = signal('');
  protected readonly maxTotal = signal('');
  protected readonly maxPerAthlete = signal('1');

  protected readonly canSave = computed(
    () => this.code().trim().length >= 3 && parseNumber(this.discountValue()) > 0 && !this.saving(),
  );

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    const value = parseNumber(this.discountValue());
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await createArenaCoupon(arenaFunctions(), {
        arenaId,
        code: this.code(),
        discountPercent: this.discountKind() === 'percent' ? value : null,
        fixedDiscountReais: this.discountKind() === 'fixed' ? value : null,
        validFrom: inputValueToIso(this.validFrom()),
        validUntil: inputValueToIso(this.validUntil()),
        maxRedemptionsTotal: this.maxTotal().trim() ? Math.floor(parseNumber(this.maxTotal())) : null,
        maxRedemptionsPerAthlete: this.maxPerAthlete().trim() ? Math.max(1, Math.floor(parseNumber(this.maxPerAthlete()))) : 1,
      });
      void this.router.navigate(['/painel/cupons']);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível criar o cupom.');
    } finally {
      this.saving.set(false);
    }
  }
}
