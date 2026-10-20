import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { ToggleComponent } from '../ui/toggle.component';
import { AulasPageComponent } from './aulas-ui';
import { DEFAULT_RULES, parsePrice, type ClassRules } from './billing.model';
import { fetchRules, saveRules } from './billing-repository';

/** 16 · Regras de aulas — só as que o sistema já aplica: crédito de reposição, cancelamento
 *  pela arena, cobrança e lembrete 2h antes. Cancelamento pelo aluno no app e QR de check-in
 *  chegam com a matrícula pelo app. */
@Component({
  selector: 'ar-panel-aulas-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, IconComponent, ToggleComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" subtitle="Regras de reposição, cancelamento e cobrança" tab="regras">
      <button page-actions type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly() || saving() || !dirty() || !valid()" (click)="save()">
        <ar-icon name="check" [size]="14" />
        {{ saving() ? 'Salvando…' : 'Salvar regras' }}
      </button>

      @if (loading()) {
        <p class="state-text">Carregando regras…</p>
      } @else {
        @if (error(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        @if (notice(); as n) {
          <div class="notice">{{ n }}</div>
        }
        <div class="grid">
          <ar-panel-card title="Reposição">
            <div class="row-2">
              <div>
                <div class="field-label">Validade do crédito (dias)</div>
                <input class="input-box" type="number" min="1" max="365" [disabled]="readOnly()" [value]="rules().makeupValidityDays" (input)="patch({ makeupValidityDays: +$any($event.target).value })" />
              </div>
              <div>
                <div class="field-label">Limite por mês</div>
                <div class="input-box static">Conforme o plano</div>
              </div>
            </div>
            <div class="toggle-row">
              <div>
                <div class="t-title">Falta justificada gera crédito</div>
                <div class="t-sub">Ao fechar a chamada, quem avisou ganha 1 crédito para repor em outra aula</div>
              </div>
              <ar-toggle label="Falta justificada gera crédito" [checked]="rules().excusedGeneratesCredit" [disabled]="readOnly()" (changed)="patch({ excusedGeneratesCredit: $event })" />
            </div>
          </ar-panel-card>

          <ar-panel-card title="Cancelamento pela arena">
            <div class="toggle-row">
              <div>
                <div class="t-title">Gerar crédito para todos os alunos</div>
                <div class="t-sub">Chuva, manutenção ou falta do professor — padrão ao cancelar uma aula (dá para mudar na hora)</div>
              </div>
              <ar-toggle label="Gerar crédito ao cancelar" [checked]="rules().arenaCancelGeneratesCredit" [disabled]="readOnly()" (changed)="patch({ arenaCancelGeneratesCredit: $event })" />
            </div>
            <p class="hint">Os alunos com conta NexaGO recebem aviso no app quando a aula é cancelada.</p>
          </ar-panel-card>

          <ar-panel-card title="Cobrança online">
            <div class="toggle-row">
              <div>
                <div class="t-title">Cobrar mensalidades pelo Asaas</div>
                <div class="t-sub">Na matrícula, escolha "Online": cada mensalidade vira uma fatura e o aluno paga com PIX ou cartão pelo link</div>
              </div>
              <ar-toggle label="Cobrar mensalidades pelo Asaas" [checked]="rules().onlineBillingEnabled" [disabled]="readOnly()" (changed)="patch({ onlineBillingEnabled: $event })" />
            </div>
            <p class="hint">
              O link vai no "Cobrar" do WhatsApp e por push para quem tem conta NexaGO. O valor cai no caixa
              da arena com a taxa do pagamento online (Pro 6%, Elite 5%, mínimo R$ 1,50; no cartão, desconta
              também a tarifa do cartão). Precisa do pagamento online ativo e da chave PIX de repasse no perfil
              da arena. Cobrança manual continua sem taxa.
            </p>
          </ar-panel-card>

          <ar-panel-card title="Lembretes">
            <div class="toggle-row">
              <div>
                <div class="t-title">Lembrete 2h antes da aula</div>
                <div class="t-sub">Push para os alunos do dia com conta NexaGO (turma e encaixes) e para o professor</div>
              </div>
              <ar-toggle label="Lembrete 2h antes da aula" [checked]="rules().classReminderEnabled" [disabled]="readOnly()" (changed)="patch({ classReminderEnabled: $event })" />
            </div>
            <p class="hint">Aluno sem conta não recebe — use o WhatsApp. Aula criada com menos de 2h de antecedência sai sem lembrete.</p>
          </ar-panel-card>

          <ar-panel-card title="Cobrança">
            <div class="row-2">
              <div>
                <div class="field-label">Vencimento padrão (dia)</div>
                <input class="input-box" type="number" min="1" max="28" [disabled]="readOnly()" [value]="rules().defaultDueDay" (input)="patch({ defaultDueDay: +$any($event.target).value })" />
              </div>
              <div>
                <div class="field-label">Taxa de matrícula (R$)</div>
                <input class="input-box" type="text" inputmode="decimal" [disabled]="readOnly()" [value]="feeText()" (input)="setFee($any($event.target).value)" />
              </div>
            </div>
            <p class="hint">
              A mensalidade é gerada pelo sistema 10 dias antes do vencimento. Na cobrança manual, o
              pagamento é registrado por aqui (PIX direto, dinheiro ou maquininha) e nada passa pela
              plataforma; na online, a baixa é automática.
            </p>
          </ar-panel-card>
        </div>
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    .static { display: flex; align-items: center; color: var(--nx-text-dim); }
    .toggle-row { display: flex; align-items: center; gap: 14px; padding: 14px 0 2px; }
    .toggle-row > div { flex: 1; min-width: 0; }
    .t-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .t-sub { font-size: 12px; color: var(--nx-text-dim); margin-top: 2px; }
    .notice {
      border-radius: var(--nx-r-2); padding: 10px 14px; font-size: 12.5px; flex: none;
      border: 1px solid rgba(43, 209, 126, 0.3); color: var(--nx-win); background: rgba(43, 209, 126, 0.08);
    }
    @media (max-width: 1100px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PanelAulasRulesComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));
  protected readonly rules = signal<ClassRules>({ ...DEFAULT_RULES });
  private readonly saved = signal<ClassRules>({ ...DEFAULT_RULES });
  protected readonly feeText = signal('0');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly dirty = computed(() => JSON.stringify(this.rules()) !== JSON.stringify(this.saved()));
  protected readonly valid = computed(() => {
    const r = this.rules();
    return Number.isInteger(r.makeupValidityDays) && r.makeupValidityDays >= 1 && r.makeupValidityDays <= 365 &&
      Number.isInteger(r.defaultDueDay) && r.defaultDueDay >= 1 && r.defaultDueDay <= 28 &&
      Number.isFinite(r.enrollmentFeeReais) && r.enrollmentFeeReais >= 0;
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    try {
      const rules = await fetchRules(arenaFirestore(), arenaId);
      this.rules.set(rules);
      this.saved.set(rules);
      this.feeText.set(String(rules.enrollmentFeeReais).replace('.', ','));
    } catch {
      this.error.set('Não foi possível carregar as regras.');
    } finally {
      this.loading.set(false);
    }
  }

  protected patch(change: Partial<ClassRules>): void {
    this.rules.set({ ...this.rules(), ...change });
    this.notice.set(null);
  }

  protected setFee(raw: string): void {
    this.feeText.set(raw);
    this.patch({ enrollmentFeeReais: raw.trim() === '' ? 0 : parsePrice(raw) });
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || !this.valid()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await saveRules(arenaFunctions(), arenaId, this.rules());
      this.rules.set(saved);
      this.saved.set(saved);
      this.notice.set('Regras salvas.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar as regras.');
    } finally {
      this.saving.set(false);
    }
  }
}
