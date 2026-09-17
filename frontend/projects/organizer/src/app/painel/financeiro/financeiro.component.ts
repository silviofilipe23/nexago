import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../auth/auth.service';
import type { PillTone } from '../data/mock-data';
import type { OrganizerTournament } from '../data/tournament.model';
import {
  PIX_KEY_TYPES,
  PIX_KEY_TYPE_HINT,
  PIX_KEY_TYPE_LABEL,
  resolveInitialPixKeyType,
  validatePixKeyForType,
  type PixKeyType,
} from '../data/pix-key';
import {
  OrganizerWalletError,
  loadWalletView,
  requestWithdrawal,
  setPayoutPixKey,
  watchTournamentWallet,
  type OrganizerLedgerEntry,
  type OrganizerPayoutProfile,
  type OrganizerWithdrawal,
  type TournamentWalletRow,
  type WithdrawalRequestResult,
} from '../data/wallet-repository';
import { formatCentsShort } from '../data/tournament-collected';
import { myMoneyTournaments } from '../data/tournament-role';
import { listMyTournaments } from '../data/tournaments-repository';
import { shouldExplainZeroBalance } from '../data/wallet-view';
import { OgBarRowComponent } from '../ui/bar-row.component';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxProcessingOverlayComponent } from '../../shared/loading/nx-processing-overlay.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

/** organizer_financial_page.dart:14 (`_minWithdrawalReais`). */
const MIN_WITHDRAWAL_REAIS = 20;

/** organizer_financial_page.dart:447-451 (`_WithdrawalTile`), com o `payoutStatus` também considerado
 *  (o mesmo sinal que o backend usa pra falha de envio de PIX — ver arena-wallet.model.ts:196-208). */
function withdrawalStatusLabel(w: Pick<OrganizerWithdrawal, 'status' | 'payoutStatus'>): string {
  const payout = (w.payoutStatus ?? '').trim().toLowerCase();
  const status = w.status.trim().toLowerCase();
  if (payout === 'failed' || status === 'rejected') return 'Falhou';
  if (payout === 'sent' || status === 'approved') return 'Enviado';
  return 'Pendente';
}

function withdrawalTone(w: Pick<OrganizerWithdrawal, 'status' | 'payoutStatus'>): PillTone {
  const payout = (w.payoutStatus ?? '').trim().toLowerCase();
  const status = w.status.trim().toLowerCase();
  if (payout === 'failed' || status === 'rejected') return 'red';
  if (payout === 'sent' || status === 'approved') return 'green';
  return 'yellow';
}

interface FinanceiroFeedback {
  ok: boolean;
  message: string;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const NO_PAYOUT_PROFILE: OrganizerPayoutProfile = { pixKey: '', pixKeyType: '', hasPixKey: false };

/** Extrato usado no KPI de taxas e na tabela — acima do default (30) pra somar o histórico real. */
const LEDGER_LIMIT_FINANCEIRO = 500;

interface EventoArrecadacaoRow {
  id: string;
  name: string;
  sub: string;
  pct: number;
  tone: 'orange' | 'green';
}

/** Caixa de cada EVENTO que o usuário alcança: saldo, extrato, saques e o pedido de saque.
 *
 *  Desde 16/09/2026 o dinheiro das inscrições cai em `tournamentWallets/{tournamentId}`,
 *  não mais numa carteira por pessoa. Então a tela não é mais "uma carteira com seletor
 *  de dono": é a lista dos caixas de evento que o dono e os GESTORES da equipe alcançam,
 *  e tudo abaixo (saldo, extrato, saques) é do caixa escolhido. Quem é ADMINISTRADOR do
 *  evento opera o resto e não vê dinheiro — cai no estado vazio se abrir a rota à mão.
 *
 *  A chave PIX de saque é dado da PESSOA (`organizerPayoutProfiles/{uid}`), não do caixa:
 *  cada um saca do caixa compartilhado para a própria chave, e o dono do evento é avisado
 *  quando o pedido não é dele. Por isso o card da chave é sempre editável e não depende
 *  do caixa em exibição. */
@Component({
  selector: 'og-financeiro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    OgPageHeaderComponent,
    OgBarRowComponent,
    OgCardComponent,
    OgIconComponent,
    OgPillComponent,
    OgFormFieldComponent,
    NxPageLoadingComponent,
    NxProcessingOverlayComponent,
    NxSpinnerComponent,
  ],
  template: `
    <og-page-header title="Financeiro" subtitle="Caixa de cada evento que você organiza">
      <!-- <a class="og-mini-btn og-mini-btn-primary" href="#og-saque-card"><og-icon name="download" [size]="14" />Sacar saldo</a> -->
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <app-nx-page-loading title="Carregando financeiro…" subtitle="Saldo, extrato e saques" />
      } @else if (loadError()) {
        <!-- Falha de carga NÃO pode cair no estado vazio: "você não alcança caixa nenhum"
             seria mentira, e é justamente a tela vazia sem explicação que abriu este projeto. -->
        <og-card kicker="Financeiro" title="Não foi possível carregar o caixa" pad="sm">
          <p class="og-fin-empty-text">{{ loadError() }}</p>
          <p class="og-fin-empty-text">
            Nada foi perdido: o saldo, o extrato e os saques continuam no lugar. Recarregue a
            página para tentar de novo.
          </p>
        </og-card>
      } @else if (selected(); as caixa) {
        @if (caixas().length > 1) {
          <div class="og-fin-caixas">
            <span class="og-fin-caixas-label">Caixa do evento</span>
            <div class="og-fin-caixas-list">
              @for (c of caixas(); track c.tournamentId) {
                <button
                  type="button"
                  class="og-fin-caixa"
                  [class.active]="c.tournamentId === caixa.tournamentId"
                  [attr.aria-pressed]="c.tournamentId === caixa.tournamentId"
                  [disabled]="switching()"
                  (click)="selectCaixa(c.tournamentId)"
                >
                  <span class="og-fin-caixa-name">{{ c.tournamentName }}</span>
                  <span class="og-fin-caixa-values">
                    <strong>{{ brl(c.availableReais) }}</strong>
                    @if (c.pendingReais > 0) {
                      <span class="pend">{{ brl(c.pendingReais) }} pendente</span>
                    }
                  </span>
                </button>
              }
            </div>
            @if (switching()) {
              <app-nx-spinner [size]="12" />
            }
          </div>
        } @else {
          <p class="og-fin-caixa-single">
            <og-icon name="trophy" [size]="14" />
            Caixa de <strong>{{ caixa.tournamentName }}</strong>
          </p>
        }
        <div class="og-kpi-row">
          <og-card pad="sm" flex="1.2">
            <div class="og-kpi-label">Saldo disponível</div>
            <div class="og-kpi-value" style="font-size:30px">{{ saldoLabel() }}</div>
            @if (saldoZeradoPorRecebimentoDireto()) {
              <p class="og-fin-saldo-note">
                Os {{ arrecadadoDiretoLabel() }} arrecadados foram recebidos direto com o
                organizador — esse dinheiro não passa pela plataforma e por isso não entra
                no caixa nem pode ser sacado aqui.
              </p>
            }
          </og-card>
          <og-card pad="sm" flex="1">
            <!-- mock (fase 2): sem agregado anual de arrecadação exposto pelo repositório do caixa -->
            <div class="og-kpi-label">Arrecadado (ano) — em breve</div>
            <div class="og-kpi-value sm" style="font-size:26px">—</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Taxas da plataforma</div>
            <div class="og-kpi-value sm" style="font-size:26px;color:var(--nx-text-dim)">{{ taxasPlataformaLabel() }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Pendente de repasse</div>
            <div class="og-kpi-value sm" style="font-size:26px;color:var(--nx-pending)">{{ pendenteLabel() }}</div>
          </og-card>
        </div>

        <div class="og-financeiro-sections">
          <div class="og-financeiro-grid">
            <og-card kicker="Movimentação" title="Extrato" pad="0">
              <div class="og-table-head">
                <span style="flex:1.4">Atletas</span>
                <span style="flex:1">Data</span>
                <span style="width:90px;text-align:right">Bruto</span>
                <span style="width:90px;text-align:right">Taxa</span>
                <span style="width:90px;text-align:right">Líquido</span>
              </div>
              <div class="og-table-body">
                @for (e of ledger(); track e.id) {
                  <div class="og-row">
                    <span style="flex:1.4" class="og-fin-evento" [title]="e.athleteLabel || 'Inscrição'">{{ e.athleteLabel || '—' }}</span>
                    <span style="flex:1" class="og-fin-date">{{ dateLabel(e.createdAt) }}</span>
                    <span style="width:90px;text-align:right" class="og-fin-value">{{ brl(e.grossReais) }}</span>
                    <span style="width:90px;text-align:right;color:var(--nx-text-dim)" class="og-fin-value">{{ brl(e.platformFeeReais) }}</span>
                    <span style="width:90px;text-align:right;color:var(--nx-win)" class="og-fin-value">{{ brl(e.netReais) }}</span>
                  </div>
                } @empty {
                  <p class="og-empty">Nenhum recebimento ainda.</p>
                }
              </div>
            </og-card>

            <div class="og-financeiro-side">
              <og-card kicker="Evolução" title="Receita por mês">
                <!-- mock (fase 2): sem série histórica de receita mensal disponível ainda -->
                <p class="og-empty">— em breve</p>
              </og-card>
              <og-card kicker="Deste evento" title="Arrecadação" flex="1">
                @if (eventosArrecadacao(); as eventos) {
                  @if (eventos.length === 0) {
                    <p class="og-empty">{{ tournamentsLoading() ? 'Carregando…' : 'Nenhum recebimento ainda.' }}</p>
                  } @else {
                    @for (e of eventos; track e.id; let last = $last) {
                      <og-bar-row [label]="e.name" [sub]="e.sub" [pct]="e.pct" [tone]="e.tone" [last]="last" />
                    }
                    <!-- O caixa só guarda o que passou pela plataforma; sem esta linha o card
                         sugere que todo o valor listado é sacável. -->
                    <p class="og-fin-hint">
                      Só o que entra pela plataforma cai no caixa do evento — o que você recebe
                      direto entra aqui para fechar o total.
                    </p>
                  }
                }
              </og-card>
            </div>
          </div>

          <div class="og-financeiro-grid">
            <og-card kicker="Repasses" title="Saques" pad="0">
              <div class="og-table-head">
                <span style="flex:1">Data</span>
                <span style="flex:1.1">Chave PIX</span>
                <span style="flex:1">Pedido por</span>
                <span style="width:100px;text-align:right">Valor</span>
                <span style="width:90px;text-align:right">Status</span>
              </div>
              <div class="og-table-body">
                @for (w of withdrawals(); track w.id) {
                  <div class="og-row">
                    <span style="flex:1" class="og-fin-date">{{ dateLabel(w.createdAt) }}</span>
                    <!-- Chave de outra pessoa já chega mascarada do servidor: exibir como veio. -->
                    <span style="flex:1.1" class="og-fin-evento" [title]="w.pixKey">{{ w.pixKey || '—' }}</span>
                    <span style="flex:1" class="og-fin-evento">{{ requestedByLabel(w) }}</span>
                    <span style="width:100px;text-align:right" class="og-fin-value">{{ brl(w.amountReais) }}</span>
                    <span style="width:90px;text-align:right"><og-pill [tone]="withdrawalToneOf(w)">{{ withdrawalLabelOf(w) }}</og-pill></span>
                  </div>
                } @empty {
                  <p class="og-empty">Nenhum saque ainda.</p>
                }
              </div>
            </og-card>

            <div class="og-financeiro-side">
              <ng-container [ngTemplateOutlet]="pixCard"></ng-container>

              <og-card kicker="Saque" title="Solicitar saque" pad="sm" id="og-saque-card">
                <og-form-field label="Valor do saque">
                  <div class="og-input og-fin-amount-input">
                    <span class="prefix">R$</span>
                    <input type="text" inputmode="decimal" [formControl]="withdrawForm.controls.amount" placeholder="0,00" />
                    <og-pill tone="orange" style="cursor:pointer" (click)="withdrawAll()">Tudo</og-pill>
                  </div>
                </og-form-field>
                @if (amountError(); as err) {
                  <p class="og-fin-error">{{ err }}</p>
                }
                @if (!hasPixKey()) {
                  <p class="og-fin-hint">Cadastre uma chave PIX acima para poder sacar.</p>
                }
                <button type="button" class="og-mini-btn og-mini-btn-primary og-fin-submit" [disabled]="!canWithdraw()" (click)="submitWithdrawal()">
                  @if (withdrawing()) {
                    <app-nx-spinner [size]="12" tone="dark" />
                  }
                  {{ withdrawing() ? 'Enviando…' : 'Solicitar saque' }}
                </button>
                @if (withdrawFeedback(); as f) {
                  <p class="og-fin-feedback" [style.color]="f.ok ? 'var(--nx-win)' : 'var(--nx-live)'">{{ f.message }}</p>
                }
                <!-- Decisão do dono (16/09/2026): o caixa é do evento e cada gestor saca para a
                     PRÓPRIA chave. Dizer isso aqui evita o gestor achar que está tirando
                     dinheiro para a conta do dono. -->
                <p class="og-fin-hint">
                  O valor vai sempre para a sua chave PIX cadastrada acima. Se o evento não é seu,
                  quem é dono dele é avisado do pedido.
                </p>
              </og-card>
            </div>
          </div>
        </div>
      } @else {
        <div class="og-financeiro-grid">
          <og-card kicker="Financeiro" title="Nenhum caixa de evento por aqui" pad="sm">
            <p class="og-fin-empty-text">
              O Financeiro mostra o caixa de cada evento — o dinheiro das inscrições pagas pela
              plataforma. Quem vê e quem saca é o dono do evento e os gestores da equipe dele;
              quem é administrador do evento cuida de tudo menos do dinheiro.
            </p>
            <p class="og-fin-empty-text">
              Se você acabou de criar seu primeiro evento, o caixa aparece aqui quando a primeira
              inscrição for paga pela plataforma. Inscrição recebida direto com você não passa
              pela plataforma e por isso não entra no caixa.
            </p>
            <p class="og-fin-empty-text">
              Se você é gestor de um evento e ele não aparece nesta tela, peça a quem é dono para
              conferir o seu papel na aba Equipe do evento.
            </p>
          </og-card>
          <div class="og-financeiro-side">
            <!-- A chave é da PESSOA, não do caixa: dá pra cadastrar antes de existir dinheiro. -->
            <ng-container [ngTemplateOutlet]="pixCard"></ng-container>
          </div>
        </div>
      }
    </div>

    <ng-template #pixCard>
      <og-card kicker="Repasse" title="Chave PIX de saque" pad="sm">
        @if (!editingPix()) {
          <div class="og-fin-pixrow">
            <span class="og-fin-pixkey">{{ currentPixLabel() }}</span>
            <button type="button" class="og-ghost-btn" (click)="startEditPix()">
              <og-icon name="edit" [size]="14" />{{ hasPixKey() ? 'Trocar' : 'Cadastrar' }}
            </button>
          </div>
          <p class="og-fin-hint">É a sua chave — o saque de qualquer caixa que você alcança vai para ela.</p>
        } @else {
          <form [formGroup]="pixForm" (ngSubmit)="submitPixKey()" class="og-fin-pixform">
            <og-form-field label="Tipo de chave">
              <select class="og-input" formControlName="pixKeyType">
                @for (t of pixKeyTypes; track t) {
                  <option [value]="t">{{ pixKeyTypeLabel[t] }}</option>
                }
              </select>
            </og-form-field>
            <og-form-field label="Chave PIX">
              <input class="og-input" type="text" formControlName="pixKey" autocomplete="off" [placeholder]="pixKeyHintFor(pixKeyTypeValue())" />
            </og-form-field>
            @if (pixKeyErrorLive(); as err) {
              <p class="og-fin-error">{{ err }}</p>
            }
            <div class="og-fin-formactions">
              <button type="button" class="og-ghost-btn" (click)="cancelEditPix()">Cancelar</button>
              <button type="submit" class="og-mini-btn og-mini-btn-primary" [disabled]="!canSavePix()">
                @if (pixSaving()) {
                  <app-nx-spinner [size]="12" tone="dark" />
                }
                {{ pixSaving() ? 'Salvando…' : 'Salvar' }}
              </button>
            </div>
          </form>
        }
        @if (pixFeedback(); as f) {
          <p class="og-fin-feedback" [style.color]="f.ok ? 'var(--nx-win)' : 'var(--nx-live)'">{{ f.message }}</p>
        }
      </og-card>
    </ng-template>

    @if (withdrawing()) {
      <app-nx-processing-overlay title="Enviando solicitação de saque…" description="Registrando o pedido no caixa do evento." />
    }
  `,
  styles: `
    /* Sem display: o box do host é do shell (regra .og-main > router-outlet + * em
       styles.scss). Aqui fica só a âncora do overlay de saque. */
    :host {
      position: relative;
    }

    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-financeiro-sections {
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: none;
      min-width: 0;
    }
    .og-financeiro-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      align-items: start;
      flex: none;
      min-width: 0;
    }
    .og-financeiro-side {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    /* Tabelas longas rolam dentro do card em vez de estourar a coluna. */
    .og-financeiro-grid > og-card.og-card-pad-0 {
      max-height: min(420px, 50vh);
    }
    @media (max-width: 1023.98px) {
      .og-financeiro-grid {
        grid-template-columns: 1fr;
      }
    }
    .og-fin-evento {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-fin-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .og-fin-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }
    .og-fin-pixrow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .og-fin-pixkey {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-fin-pixform {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .og-fin-formactions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 2px;
    }
    .og-fin-amount-input {
      gap: 8px;
    }
    .og-fin-amount-input .prefix {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-fin-amount-input input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 15px;
      color: var(--nx-text);
    }
    .og-fin-submit {
      width: 100%;
      justify-content: center;
      margin-top: 10px;
    }
    .og-fin-error {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-live);
      margin: 2px 0 0;
    }
    .og-fin-hint {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 8px 0 0;
    }
    .og-fin-feedback {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      margin: 10px 0 0;
    }
    /* Lista de caixas: um por evento alcançado, com o saldo na cara — o organizador
       decide de qual caixa está falando antes de olhar os números abaixo. */
    .og-fin-caixas {
      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
    }
    .og-fin-caixas-label {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      padding-top: 8px;
    }
    .og-fin-caixas-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
    .og-fin-caixa {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      min-width: 150px;
      max-width: 260px;
      padding: 7px 12px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      cursor: pointer;
      text-align: left;
      transition: all 140ms var(--nx-ease-out);
    }
    .og-fin-caixa:hover:not(:disabled) {
      border-color: var(--nx-line-strong);
    }
    .og-fin-caixa:disabled {
      cursor: default;
      opacity: 0.6;
    }
    .og-fin-caixa.active {
      border-color: var(--nx-orange-500);
      background: var(--nx-surface-1);
    }
    .og-fin-caixa-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-fin-caixa-values {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .og-fin-caixa-values strong {
      font-size: 12.5px;
      color: var(--nx-win);
    }
    .og-fin-caixa-values .pend {
      color: var(--nx-pending);
    }
    .og-fin-caixa-single {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 0 0 14px;
    }
    .og-fin-caixa-single strong {
      color: var(--nx-text);
    }
    .og-fin-empty-text {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-dim);
      margin: 0 0 10px;
    }
    .og-fin-empty-text:last-child {
      margin-bottom: 0;
    }
    .og-fin-saldo-note {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 1.45;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }
  `,
})
export class FinanceiroComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);

  /** uid de quem está logado — usado só para rotular os saques ("Você" × equipe). */
  private readonly uid = this.auth.user()?.uid ?? '';

  protected readonly pixKeyTypes = PIX_KEY_TYPES;
  protected readonly pixKeyTypeLabel = PIX_KEY_TYPE_LABEL;

  protected readonly loading = signal(true);
  protected readonly tournamentsLoading = signal(true);
  /** Torneios cujo caixa este usuário alcança — o recorte é de `myMoneyTournaments`, não
   *  feito à mão: administrador do evento aparece em `listMyTournaments` e não aqui. */
  protected readonly tournaments = signal<OrganizerTournament[]>([]);
  /** Todos os caixas alcançados, para a lista de eventos. */
  protected readonly caixas = signal<TournamentWalletRow[]>([]);
  /** O caixa em exibição. `null` = não alcança caixa nenhum (estado vazio). */
  protected readonly selected = signal<TournamentWalletRow | null>(null);
  /** Chave PIX de saque de quem está logado — da PESSOA, não do caixa. */
  protected readonly payout = signal<OrganizerPayoutProfile>(NO_PAYOUT_PROFILE);
  protected readonly ledger = signal<OrganizerLedgerEntry[]>([]);
  protected readonly withdrawals = signal<OrganizerWithdrawal[]>([]);
  /** Mensagem de falha da carga. Separada do estado vazio de propósito: os dois
   *  mostram tela sem números e têm explicações opostas. */
  protected readonly loadError = signal<string | null>(null);

  /** Troca de caixa em andamento — só desabilita a lista, sem piscar a tela. */
  protected readonly switching = signal(false);

  protected readonly editingPix = signal(false);
  protected readonly pixSaving = signal(false);
  protected readonly pixFeedback = signal<FinanceiroFeedback | null>(null);

  protected readonly withdrawing = signal(false);
  protected readonly withdrawFeedback = signal<FinanceiroFeedback | null>(null);

  /** Listener do saldo ao vivo do caixa em exibição; trocado a cada seleção. */
  private stopWalletWatch: (() => void) | null = null;

  protected readonly pixForm = this.fb.group({
    pixKeyType: 'CPF' as PixKeyType,
    pixKey: '',
  });
  protected readonly withdrawForm = this.fb.group({
    amount: '',
  });

  private readonly pixKeyTypeValueSignal = toSignal(this.pixForm.controls.pixKeyType.valueChanges, { initialValue: 'CPF' as PixKeyType });
  private readonly pixKeyValueSignal = toSignal(this.pixForm.controls.pixKey.valueChanges, { initialValue: '' });
  private readonly amountValueSignal = toSignal(this.withdrawForm.controls.amount.valueChanges, { initialValue: '' });

  /** O evento do caixa em exibição, dentro dos torneios que este usuário alcança.
   *  O caixa é DO EVENTO, então só a arrecadação dele pode aparecer ao lado do saldo —
   *  somar outros eventos aqui mostraria dinheiro que não sai deste caixa. */
  private readonly eventoDoCaixa = computed<OrganizerTournament | null>(() => {
    const id = this.selected()?.tournamentId;
    if (!id) return null;
    return this.tournaments().find((t) => t.id === id) ?? null;
  });

  protected readonly eventosArrecadacao = computed<EventoArrecadacaoRow[]>(() => {
    const evento = this.eventoDoCaixa();
    if (!evento || evento.collected.totalCents <= 0) return [];
    const c = evento.collected;
    const direto = c.viaOrganizerCents > c.viaAppCents;
    return [
      {
        id: evento.id,
        name: evento.name,
        sub: `${formatCentsShort(c.totalCents)}${direto ? ' · direto' : ''}`,
        pct: 100,
        // Verde = está no caixa; laranja = maior parte veio por fora e não é sacável aqui.
        tone: direto ? ('orange' as const) : ('green' as const),
      },
    ];
  });

  /** O que ESTE evento recebeu por fora da plataforma. */
  private readonly arrecadadoDiretoCents = computed(
    () => this.eventoDoCaixa()?.collected.viaOrganizerCents ?? 0,
  );

  /** O caso que gerou a reclamação de "saldo zerado": o torneio arrecadou, mas o
   *  dinheiro foi recebido direto com o organizador e nunca passou pelo caixa.
   *  Sem esta explicação a tela mostra arrecadação alta ao lado de R$ 0,00 e o
   *  organizador conclui que a plataforma perdeu o dinheiro dele. */
  protected readonly saldoZeradoPorRecebimentoDireto = computed(() =>
    shouldExplainZeroBalance({
      availableReais: this.disponivel(),
      pendingReais: this.selected()?.pendingReais ?? 0,
      ledgerCount: this.ledger().length,
      viaOrganizerCents: this.arrecadadoDiretoCents(),
    }),
  );

  protected readonly arrecadadoDiretoLabel = computed(() =>
    BRL.format(this.arrecadadoDiretoCents() / 100),
  );

  /** Saldo sacável do caixa em exibição. Sem caixa nenhum, zero — e nada de saque. */
  protected readonly disponivel = computed(() => this.selected()?.availableReais ?? 0);
  protected readonly saldoLabel = computed(() => BRL.format(this.disponivel()));
  protected readonly pendenteLabel = computed(() => BRL.format(this.selected()?.pendingReais ?? 0));
  /** Soma das taxas já descontadas nos créditos do caixa (campo `platformFeeReais` do ledger). */
  protected readonly taxasPlataformaLabel = computed(() =>
    BRL.format(this.ledger().reduce((sum, e) => sum + e.platformFeeReais, 0)),
  );

  /** Quem responde "dá pra sacar?" é o flag do servidor (mesmo piso de 5 caracteres
   *  que o saque usa) — a chave é a de quem está logado, sempre vem por extenso. */
  protected readonly hasPixKey = computed(() => this.payout().hasPixKey);
  private readonly payoutPixKeyType = computed<PixKeyType>(() =>
    resolveInitialPixKeyType(this.payout().pixKeyType, this.payout().pixKey),
  );
  protected readonly currentPixLabel = computed(() =>
    this.payout().hasPixKey
      ? `${PIX_KEY_TYPE_LABEL[this.payoutPixKeyType()]} · ${this.payout().pixKey}`
      : 'Nenhuma chave cadastrada',
  );

  /** organizer_financial_page.dart:600-602 (`_PixKeyEditSheetState` — erro aparece a partir de chave não-vazia). */
  protected readonly pixKeyErrorLive = computed<string | null>(() => {
    const key = this.pixKeyValueSignal().trim();
    if (!key) return null;
    return validatePixKeyForType(this.pixKeyTypeValueSignal(), key);
  });
  /** organizer_financial_page.dart:602 (`canSave`). */
  protected readonly canSavePix = computed(() => {
    if (this.pixSaving()) return false;
    return this.pixKeyValueSignal().trim().length >= 5 && this.pixKeyErrorLive() == null;
  });

  protected readonly parsedAmount = computed<number | null>(() => {
    const raw = this.amountValueSignal().trim().replace(',', '.');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });

  /** organizer_financial_page.dart:44-56 (`_amountError`), incluindo o piso de R$ 20 (linha 14). */
  protected readonly amountError = computed<string | null>(() => {
    const raw = this.amountValueSignal().trim();
    if (!raw) return null;
    const amount = this.parsedAmount();
    if (amount == null) return 'Informe um valor válido.';
    if (amount < MIN_WITHDRAWAL_REAIS) return `Mínimo: ${BRL.format(MIN_WITHDRAWAL_REAIS)}.`;
    if (amount > this.disponivel() + 0.001) return `Máximo disponível: ${BRL.format(this.disponivel())}.`;
    return null;
  });

  /** organizer_financial_page.dart:58-65 (`_canSubmit`). */
  protected readonly canWithdraw = computed(() => {
    if (this.withdrawing()) return false;
    if (this.selected() == null) return false;
    if (!this.hasPixKey()) return false;
    const amount = this.parsedAmount();
    if (amount == null || amount < MIN_WITHDRAWAL_REAIS) return false;
    return this.amountError() == null;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopWatchingWallet());

    if (!this.uid) {
      this.loading.set(false);
      this.tournamentsLoading.set(false);
      return;
    }

    // Independente do caixa: uma falha aqui não pode esconder saldo, extrato nem saque.
    // Só os torneios cujo caixa este usuário alcança — administrador do evento entra em
    // `listMyTournaments` e não pode aparecer na arrecadação ao lado de dinheiro.
    listMyTournaments(this.uid)
      .then((tournaments) => this.tournaments.set(myMoneyTournaments(tournaments)))
      .catch(() => this.tournaments.set([]))
      .finally(() => this.tournamentsLoading.set(false));

    void this.loadWallet();
  }

  /** Carrega a lista de caixas + o caixa escolhido numa chamada só. Sem `tournamentId`
   *  o servidor devolve o caixa mais cheio. */
  private async loadWallet(tournamentId?: string): Promise<void> {
    try {
      const view = await loadWalletView(tournamentId, LEDGER_LIMIT_FINANCEIRO);
      this.loadError.set(null);
      this.caixas.set(view.tournaments);
      this.selected.set(view.selected);
      this.payout.set(view.payout);
      this.ledger.set(view.ledger);
      this.withdrawals.set(view.withdrawals);
      if (view.selected) this.watchSelectedWallet(view.selected.tournamentId);
      else this.stopWatchingWallet();
    } catch (err) {
      const message = err instanceof OrganizerWalletError ? err.message : 'Não foi possível carregar o financeiro.';
      this.loadError.set(message);
      this.stopWatchingWallet();
      this.caixas.set([]);
      this.selected.set(null);
      this.ledger.set([]);
      this.withdrawals.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  /** Saldo ao vivo do caixa em exibição: uma inscrição paga durante a visita cai aqui
   *  sem recarregar a tela. O snapshot só escreve no caixa que ele observa — um
   *  snapshot atrasado do caixa anterior não pode reescrever o saldo do novo. */
  private watchSelectedWallet(tournamentId: string): void {
    this.stopWatchingWallet();
    this.stopWalletWatch = watchTournamentWallet(tournamentId, (w) => {
      this.selected.update((cur) => (cur && cur.tournamentId === tournamentId ? { ...cur, ...w } : cur));
      this.caixas.update((rows) => rows.map((r) => (r.tournamentId === tournamentId ? { ...r, ...w } : r)));
    });
  }

  private stopWatchingWallet(): void {
    this.stopWalletWatch?.();
    this.stopWalletWatch = null;
  }

  protected async selectCaixa(tournamentId: string): Promise<void> {
    if (tournamentId === this.selected()?.tournamentId || this.switching()) return;
    this.switching.set(true);
    this.editingPix.set(false);
    this.pixFeedback.set(null);
    this.withdrawFeedback.set(null);
    this.withdrawForm.controls.amount.setValue('');
    try {
      await this.loadWallet(tournamentId);
    } finally {
      this.switching.set(false);
    }
  }

  protected dateLabel(date: Date | null): string {
    return date ? DATE_FORMAT.format(date) : '—';
  }

  protected brl(n: number): string {
    return BRL.format(n);
  }

  protected pixKeyTypeValue(): PixKeyType {
    return this.pixKeyTypeValueSignal();
  }

  protected pixKeyHintFor(type: PixKeyType): string {
    return PIX_KEY_TYPE_HINT[type];
  }

  protected withdrawalLabelOf(w: OrganizerWithdrawal): string {
    return withdrawalStatusLabel(w);
  }

  protected withdrawalToneOf(w: OrganizerWithdrawal): PillTone {
    return withdrawalTone(w);
  }

  /** Quem pediu o saque. Sem nome: a callable manda o uid, e `requestedByStaff` já
   *  diz o que importa — se foi a equipe ou quem é dono do evento. */
  protected requestedByLabel(w: OrganizerWithdrawal): string {
    if (w.requestedBy && w.requestedBy === this.uid) return 'Você';
    return w.requestedByStaff ? 'Gestor da equipe' : 'Dono do evento';
  }

  protected startEditPix(): void {
    this.pixForm.setValue({ pixKeyType: this.payoutPixKeyType(), pixKey: this.payout().pixKey });
    this.pixFeedback.set(null);
    this.editingPix.set(true);
  }

  protected cancelEditPix(): void {
    this.editingPix.set(false);
  }

  /** organizer_financial_page.dart:73-103 (`_editPixKey`) — atualiza o estado local e só então
   *  chama a callable; erro na callable não desfaz o valor local (mesmo comportamento do Flutter). */
  protected async submitPixKey(): Promise<void> {
    if (!this.canSavePix()) return;
    const type = this.pixKeyTypeValueSignal();
    const key = this.pixKeyValueSignal().trim();

    // `hasPixKey: true` acompanha o piso do servidor (5 caracteres), já garantido por `canSavePix`.
    this.payout.set({ pixKey: key, pixKeyType: type, hasPixKey: true });
    this.editingPix.set(false);
    this.pixSaving.set(true);
    this.pixFeedback.set(null);
    try {
      await setPayoutPixKey(key, type);
      this.pixFeedback.set({ ok: true, message: 'Chave PIX salva.' });
    } catch (err) {
      const message = err instanceof OrganizerWalletError ? err.message : 'Não foi possível salvar a chave.';
      this.pixFeedback.set({ ok: false, message: `Não foi possível salvar a chave: ${message}` });
    } finally {
      this.pixSaving.set(false);
    }
  }

  protected withdrawAll(): void {
    const available = this.disponivel();
    if (available <= 0) return;
    this.withdrawForm.controls.amount.setValue(available.toFixed(2).replace('.', ','));
  }

  /** organizer_financial_page.dart:105-139 (`_requestWithdrawal`) — agora com o torneio no
   *  lugar da chave: o destino é o perfil de quem pede, resolvido no servidor. */
  protected async submitWithdrawal(): Promise<void> {
    const caixa = this.selected();
    const amount = this.parsedAmount();
    if (caixa == null || amount == null || !this.canWithdraw()) return;

    this.withdrawing.set(true);
    this.withdrawFeedback.set(null);
    try {
      const result = await requestWithdrawal(caixa.tournamentId, amount);
      this.withdrawForm.controls.amount.setValue('');
      const failedPayout = result.status === 'pending' && result.payoutStatus === 'failed';
      this.withdrawFeedback.set({ ok: !failedPayout, message: this.resultMessage(result) });
      // O listener cobre o saldo, mas não o extrato nem a lista de saques: recarrega.
      await this.loadWallet(caixa.tournamentId);
    } catch (err) {
      const message = err instanceof OrganizerWalletError ? err.message : 'Não foi possível solicitar o saque.';
      this.withdrawFeedback.set({ ok: false, message });
    } finally {
      this.withdrawing.set(false);
    }
  }

  /** organizer_financial_page.dart:141-152 (`_resultMessage`) — sem o ramo `processingMode` porque o
   *  contrato TS de `WithdrawalRequestResult` (wallet-repository.ts) não expõe esse campo; o texto do
   *  backend em `message` cobre o mesmo caso quando aplicável. */
  private resultMessage(r: WithdrawalRequestResult): string {
    if (r.autoProcessed && r.status === 'approved' && r.payoutStatus === 'sent') {
      return 'PIX enviado. O valor deve cair em instantes na sua chave.';
    }
    if (r.message?.trim()) return r.message.trim();
    return 'Saque solicitado. Aguarde aprovação.';
  }
}
