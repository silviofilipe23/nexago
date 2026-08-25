import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { initialsOf } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { formatPhoneBR, telLink, whatsAppLink } from '../data/phone-contact';
import {
  PAY_LABEL,
  PAY_TONE,
  type InscricaoAction,
  type InscricaoAthlete,
  type InscricaoRow,
} from './inscricoes.model';

/** Links prontos de um telefone válido — `null` quando não dá pra contatar. */
interface PhoneLinks {
  label: string;
  whatsapp: string;
  tel: string;
}

/** Lista de inscrições — só apresentação: recebe as linhas prontas e emite a ação escolhida.
 *
 *  Cabeçalho e linha compartilham UM grid (`--insc-cols`), que é o que conserta o desalinhamento
 *  do layout antigo: lá cada célula tinha `flex`/`width` inline repetidos nos dois lugares, e a
 *  coluna de avatares (largura fixa p/ até 5, alinhamento estável entre linhas) empurrava tudo —
 *  as colunas nem batiam com o cabeçalho, nem entre linhas.
 *
 *  Estados que exigem decisão do organizador (dinheiro declarado sem conferência, pedido de
 *  cancelamento) ganham um filete colorido na borda da linha. É o único adorno da tela, e é
 *  informação: marca as poucas linhas que precisam dele, não todas. */
@Component({
  selector: 'og-inscricoes-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent, OgPillComponent, OgAvatarComponent, NxSpinnerComponent],
  host: {
    /** Slot = maior elenco das linhas (1–5); nomes alinhados sem reservar 5 sempre. */
    '[style.--insc-avatar-n]': 'maxAvatarStack()',
  },
  template: `
    <div class="og-insc-head" role="presentation">
      <span></span>
      <span>Atleta / equipe</span>
      <span class="col-cat">Categoria</span>
      <span class="col-date">Inscrita em</span>
      <span>Pagamento</span>
      <span></span>
    </div>

    <div class="og-insc-body">
        @if (loading()) {
          @for (i of skeletons; track i) {
            <div class="og-insc-skeleton" [style.opacity]="1 - i * 0.18"></div>
          }
        } @else {
          @for (r of rows(); track r.id) {
            <div
              class="og-insc-row"
              [class.needs-check]="r.pay === 'conferir' && !r.cancelPending"
              [class.needs-decision]="r.cancelPending"
            >
              <div class="og-insc-main">
                <span class="og-insc-avatars">
                  @for (a of r.athletes; track $index; let i = $index) {
                    <og-avatar
                      zoomable
                      [initials]="initialsOf(a.name)"
                      [personName]="a.name"
                      [meta]="athleteMeta(r)"
                      [photoUrl]="a.photoUrl"
                      [size]="36"
                      [style.z-index]="r.athletes.length - i"
                    />
                  }
                </span>

                <span class="og-insc-who">
                  <span class="og-insc-name" [title]="r.name">{{ r.name }}</span>
                  @if (r.cancelPending || r.lgpd !== 'aceito' || r.roster) {
                    <span class="og-insc-flags">
                      @if (r.roster; as roster) {
                        <span class="og-insc-flag" title="Elenco incompleto — a equipe só entra na chave completa">
                          <og-icon name="users" [size]="12" />{{ roster }}
                        </span>
                      }
                      @if (r.cancelPending) {
                        <span class="og-insc-flag danger">
                          <og-icon name="flag" [size]="12" />Cancelamento pedido
                        </span>
                      }
                      @if (r.lgpd !== 'aceito') {
                        <span class="og-insc-flag warn" [title]="lgpdTitle(r)">
                          <og-icon name="alert" [size]="12" />
                          {{ r.lgpd === 'parcial' ? 'Termo de imagem parcial' : 'Termo de imagem pendente' }}
                        </span>
                      }
                    </span>
                  }
                  <!-- Quando a coluna cai por falta de largura, o dado desce pra cá em vez de sumir. -->
                  <span class="og-insc-inline-meta">
                    <span class="m-cat">{{ r.categoria }}</span>
                    <span class="m-date">{{ r.date }}</span>
                  </span>
                </span>

                <span class="og-insc-cat col-cat" [title]="r.categoria">{{ r.categoria }}</span>
                <span class="og-insc-date col-date">{{ r.date }}</span>

                <span class="og-insc-pay" [title]="r.payTitle">
                  <og-pill [tone]="payTone[r.pay]">{{ payLabel[r.pay] }}</og-pill>
                  @if (r.payNote; as note) {
                    <span class="og-insc-paynote">{{ note }}</span>
                  }
                </span>

                <button
                  type="button"
                  class="og-insc-toggle"
                  [attr.aria-expanded]="openId() === r.id"
                  [attr.aria-controls]="'insc-drawer-' + r.id"
                  [attr.aria-label]="(openId() === r.id ? 'Fechar detalhes de ' : 'Detalhes e ações de ') + r.name"
                  (click)="toggled.emit(r.id)"
                >
                  <og-icon name="chevron" [size]="15" />
                </button>
              </div>

              @if (openId() === r.id) {
                <div class="og-insc-drawer" [id]="'insc-drawer-' + r.id">
                  <div class="og-insc-detail">
                    <div class="og-insc-detail-label">Atletas</div>
                    <ul class="og-insc-athletes">
                      @for (a of r.athletes; track a.name) {
                        <li>
                          <span class="who">
                            <span class="nm">{{ a.name }}</span>
                            <span class="lgpd" [class.ok]="a.lgpdAccepted">
                              <og-icon [name]="a.lgpdAccepted ? 'check' : 'alert'" [size]="12" />
                              {{ a.lgpdAccepted ? 'Termo de imagem aceito' : 'Termo de imagem pendente' }}
                            </span>
                          </span>

                          <!-- Contato direto: o telefone só existe aqui, dentro da gaveta. Na
                               linha da lista seria PII exposta em toda varredura da tela. -->
                          @if (phoneOf(a); as phone) {
                            <span class="contact">
                              <a class="og-mini-btn" [href]="phone.whatsapp" target="_blank" rel="noopener"
                                 [attr.aria-label]="'Abrir WhatsApp de ' + a.name + ', ' + phone.label">
                                <og-icon name="whatsapp" [size]="13" />WhatsApp
                              </a>
                              <a class="og-mini-btn num" [href]="phone.tel"
                                 [attr.aria-label]="'Ligar para ' + a.name + ', ' + phone.label">
                                <og-icon name="phone" [size]="13" />{{ phone.label }}
                              </a>
                              <button type="button" class="og-mini-btn"
                                      [attr.aria-label]="'Copiar telefone de ' + a.name"
                                      (click)="copyPhone(a)">
                                <og-icon [name]="copiedPhone() === a.phone ? 'check' : 'copy'" [size]="13" />
                                {{ copiedPhone() === a.phone ? 'Copiado' : 'Copiar' }}
                              </button>
                            </span>
                          } @else if (a.phone) {
                            <!-- Tem número gravado, mas não é telefone BR válido: mostrar o que
                                 está cadastrado é melhor que um botão que abre conversa errada. -->
                            <span class="contact-none">Telefone inválido: {{ a.phone }}</span>
                          } @else {
                            <span class="contact-none">Sem telefone cadastrado</span>
                          }
                        </li>
                      }
                    </ul>
                    <div class="og-insc-detail-label">Inscrita em</div>
                    <div class="og-insc-detail-value">{{ r.dateLong }}</div>
                  </div>

                  @if (r.cancelPending) {
                    <div class="og-insc-cancel">
                      <strong class="og-insc-cancel-title">O atleta pediu para cancelar</strong>
                      @if (r.cancelReason) {
                        <p class="og-insc-cancel-reason">“{{ r.cancelReason }}”</p>
                      }
                      <p class="og-insc-cancel-warn">{{ refundNotice }}</p>
                      <input
                        type="text"
                        class="og-insc-cancel-input"
                        maxlength="500"
                        [attr.aria-label]="'Resposta ao atleta sobre o cancelamento de ' + r.name"
                        placeholder="Resposta ao atleta (opcional)"
                        [value]="note()"
                        (input)="onNoteInput($event)"
                      />
                      <div class="og-insc-cancel-actions">
                        <button type="button" class="og-mini-btn og-mini-btn-danger" [disabled]="busy()" (click)="emitAction('cancel-approve', r)">
                          @if (busyKey() === 'cancel-approve:' + r.id) {
                            <app-nx-spinner [size]="12" />
                          }
                          {{ busyKey() === 'cancel-approve:' + r.id ? 'Aprovando…' : 'Aprovar e liberar vaga' }}
                        </button>
                        <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="emitAction('cancel-decline', r)">
                          @if (busyKey() === 'cancel-decline:' + r.id) {
                            <app-nx-spinner [size]="12" />
                          }
                          {{ busyKey() === 'cancel-decline:' + r.id ? 'Recusando…' : 'Recusar pedido' }}
                        </button>
                      </div>
                    </div>
                  }

                  <div class="og-insc-actions">
                    @if (r.pay !== 'pago') {
                      <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="busy()" (click)="emitAction('confirm', r)">
                        @if (busyKey() === 'confirm:' + r.id) {
                          <app-nx-spinner [size]="12" tone="dark" />
                        }
                        {{ busyKey() === 'confirm:' + r.id ? 'Confirmando…' : confirmLabel(r) }}
                      </button>
                      <!-- Em "conferir" os dois já declararam: resendRegistrationPayment só
                           cobra quem falta em sharePaidUids, ou seja, não avisaria ninguém. -->
                      @if (r.pay !== 'conferir') {
                        <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="emitAction('resend', r)">
                          @if (busyKey() === 'resend:' + r.id) {
                            <app-nx-spinner [size]="12" />
                          }
                          {{ busyKey() === 'resend:' + r.id ? 'Reenviando…' : 'Reenviar cobrança' }}
                        </button>
                      }
                    } @else if (r.canRevertPayment) {
                      <!-- Contraparte de "Confirmar pagamento": só aparece na baixa que o
                           organizador lançou. Pagamento recebido pela plataforma não tem
                           botão — o dinheiro está numa conta e sai por estorno. -->
                      <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="emitAction('revert-payment', r)">
                        @if (busyKey() === 'revert-payment:' + r.id) {
                          <app-nx-spinner [size]="12" />
                        }
                        {{ busyKey() === 'revert-payment:' + r.id ? 'Revertendo…' : 'Reverter pagamento' }}
                      </button>
                    }
                    @if (r.pay !== 'espera') {
                      <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="emitAction('waitlist', r)">
                        @if (busyKey() === 'waitlist:' + r.id) {
                          <app-nx-spinner [size]="12" />
                        }
                        {{ busyKey() === 'waitlist:' + r.id ? 'Movendo…' : 'Mover pra espera' }}
                      </button>
                    }
                    <span class="og-insc-actions-gap"></span>
                    <button type="button" class="og-mini-btn og-mini-btn-danger" [disabled]="busy()" (click)="emitAction('remove', r)">
                      @if (busyKey() === 'remove:' + r.id) {
                        <app-nx-spinner [size]="12" />
                      }
                      {{ busyKey() === 'remove:' + r.id ? 'Removendo…' : 'Remover da categoria' }}
                    </button>
                  </div>
                </div>
              }
            </div>
          } @empty {
            <div class="og-insc-empty">
              <p class="t">{{ emptyTitle() }}</p>
              <p class="h">{{ emptyHint() }}</p>
              @if (canClear()) {
                <button type="button" class="og-mini-btn" (click)="cleared.emit()">Limpar filtros</button>
              }
            </div>
          }
        }
    </div>
  `,
  styles: `
    /* Mesma superfície do og-card, mas o card é o próprio componente: assim o recuo pertence ao
       cabeçalho e às linhas (que precisam sangrar até a borda no hover e no filete), e o
       \`overflow: hidden\` corta tudo no raio do card. */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      min-width: 0;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      overflow: hidden;
      /* Referência das container queries lá embaixo. */
      container-type: inline-size;
      /* Coluna de avatares: largura = maior elenco da lista (1–5). */
      --insc-avatar: 36px;
      --insc-avatar-step: 24px; /* size − overlap (−12px) */
      --insc-avatar-n: 1;
      --insc-avatars-col: calc(
        var(--insc-avatar) + (var(--insc-avatar-n) - 1) * var(--insc-avatar-step)
      );
      /* avatares · equipe · categoria · data · pagamento · gaveta */
      --insc-cols: var(--insc-avatars-col) minmax(0, 1.7fr) minmax(0, 1fr) 84px 150px 34px;
      --insc-gap: 14px;
      --insc-inset: 20px;
    }

    .og-insc-head,
    .og-insc-main {
      display: grid;
      grid-template-columns: var(--insc-cols);
      gap: var(--insc-gap);
      align-items: center;
    }

    .og-insc-head {
      padding: 13px var(--insc-inset);
      border-bottom: 1px solid var(--nx-line);
      flex: none;
    }

    .og-insc-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .og-insc-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
      padding: 0 var(--insc-inset);
    }

    .og-insc-row {
      position: relative;
      margin: 0 calc(var(--insc-inset) * -1);
      padding: 0 var(--insc-inset);
      border-bottom: 1px solid var(--nx-line);
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .og-insc-row:last-child {
      border-bottom: none;
    }

    .og-insc-row:hover {
      background: rgba(255, 255, 255, 0.022);
    }

    /* Filete: só nas linhas que dependem de uma decisão do organizador. */
    .og-insc-row::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2px;
      background: transparent;
    }

    .og-insc-row.needs-check::before {
      background: var(--nx-orange-500);
    }

    .og-insc-row.needs-decision::before {
      background: var(--nx-live);
    }

    .og-insc-main {
      min-height: 62px;
      padding: 11px 0;
    }

    /* Slot fixo (até 5); 1–4 só ocupam a esquerda — o nome não “pula”. */
    .og-insc-avatars {
      display: flex;
      align-items: center;
      width: var(--insc-avatars-col);
      min-width: var(--insc-avatars-col);
      flex-shrink: 0;
    }

    .og-insc-avatars .og-avatar {
      flex-shrink: 0;
      box-shadow: 0 0 0 2px var(--nx-surface-0);
    }

    .og-insc-avatars .og-avatar + .og-avatar {
      margin-left: -12px;
    }

    .og-insc-who {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .og-insc-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      letter-spacing: -0.005em;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .og-insc-flags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
    }

    .og-insc-flag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      font-weight: 500;
      color: var(--nx-text-dim);
    }

    .og-insc-flag.warn {
      color: var(--nx-pending);
    }

    .og-insc-flag.danger {
      color: var(--nx-live);
    }

    /* Só aparece quando as colunas de categoria/data saem do grid (cards estreitos). */
    .og-insc-inline-meta {
      display: none;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    .og-insc-inline-meta .m-cat {
      display: none;
    }

    .og-insc-inline-meta .m-cat::after {
      content: ' · ';
      color: var(--nx-text-dim);
    }

    .og-insc-inline-meta .m-date {
      font-family: var(--nx-font-mono);
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }

    .og-insc-cat {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .og-insc-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }

    .og-insc-pay {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      min-width: 0;
    }

    .og-insc-paynote {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      line-height: 1.35;
      color: var(--nx-text-dim);
    }

    .og-insc-toggle {
      width: 34px;
      height: 34px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: 1px solid transparent;
      color: var(--nx-text-dim);
      display: grid;
      place-items: center;
      cursor: pointer;
      transition:
        background var(--nx-d-fast) var(--nx-ease-out),
        color var(--nx-d-fast) var(--nx-ease-out),
        border-color var(--nx-d-fast) var(--nx-ease-out);
    }

    .og-insc-toggle:hover {
      background: var(--nx-surface-1);
      border-color: var(--nx-line);
      color: var(--nx-text);
    }

    .og-insc-toggle og-icon {
      display: grid;
      /* O chevron do design system aponta pra direita; 90° = fechado, -90° = aberto. */
      transform: rotate(90deg);
      transition: transform var(--nx-d-base) var(--nx-ease-out);
    }

    .og-insc-toggle[aria-expanded='true'] {
      background: var(--nx-surface-1);
      border-color: var(--nx-line);
      color: var(--nx-text);
    }

    .og-insc-toggle[aria-expanded='true'] og-icon {
      transform: rotate(-90deg);
    }

    .og-insc-drawer {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 2px 0 18px calc(60px + var(--insc-gap));
    }

    .og-insc-detail-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .og-insc-detail-label + .og-insc-detail-label,
    .og-insc-athletes + .og-insc-detail-label {
      margin-top: 12px;
    }

    .og-insc-detail-value {
      margin-top: 5px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .og-insc-athletes {
      list-style: none;
      margin: 7px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    /* Cada atleta é um bloco: identidade em cima, contato embaixo. Numa linha só, o par
       "WhatsApp + Ligar" empurrava o termo de imagem pra fora em qualquer largura de painel. */
    .og-insc-athletes li {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .og-insc-athletes li + li {
      padding-top: 10px;
      border-top: 1px dashed var(--nx-line);
    }

    .og-insc-athletes .who {
      display: flex;
      align-items: baseline;
      gap: 12px;
      flex-wrap: wrap;
    }

    .og-insc-athletes .contact {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* O botão de ligar é a etiqueta E a ação: o número tem de ler como número. */
    .og-insc-athletes .contact .num {
      font-family: var(--nx-font-mono);
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }

    .og-insc-athletes .contact-none {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .og-insc-athletes .nm {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      font-weight: 500;
      color: var(--nx-text);
    }

    .og-insc-athletes .lgpd {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-pending);
    }

    .og-insc-athletes .lgpd.ok {
      color: var(--nx-text-dim);
    }

    .og-insc-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding-top: 4px;
      border-top: 1px solid var(--nx-line);
      margin-top: 2px;
    }

    /* Empurra "Remover" pro fim da barra: ação destrutiva não fica encostada nas outras. */
    .og-insc-actions-gap {
      flex: 1;
      min-width: 12px;
    }

    .og-insc-cancel {
      padding: 13px 14px;
      border: 1px solid rgba(255, 59, 48, 0.32);
      border-radius: var(--nx-r-2);
      background: rgba(255, 59, 48, 0.06);
    }

    .og-insc-cancel-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .og-insc-cancel-reason,
    .og-insc-cancel-warn {
      margin: 7px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }

    .og-insc-cancel-warn {
      color: var(--nx-text-dim);
    }

    .og-insc-cancel-input {
      box-sizing: border-box;
      width: 100%;
      max-width: 460px;
      margin-top: 11px;
      padding: 8px 10px;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-1);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }

    .og-insc-cancel-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 11px;
    }

    /* Ocupa a altura do card em vez de deixar o texto boiando no topo de um vazio de 600px. */
    .og-insc-empty {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 46px 20px 60px;
      text-align: center;
    }

    .og-insc-empty .t {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .og-insc-empty .h {
      margin: 6px 0 16px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .og-insc-skeleton {
      height: 62px;
      margin: 0 calc(var(--insc-inset) * -1);
      border-bottom: 1px solid var(--nx-line);
      position: relative;
      overflow: hidden;
    }

    .og-insc-skeleton::after {
      content: '';
      position: absolute;
      inset: 11px var(--insc-inset);
      border-radius: var(--nx-r-1);
      background: var(--nx-surface-1);
    }

    @media (prefers-reduced-motion: no-preference) {
      .og-insc-skeleton::after {
        animation: og-insc-pulse 1.4s ease-in-out infinite;
      }
    }

    @keyframes og-insc-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.45;
      }
    }

    /* Coluna some por prioridade — data primeiro, categoria depois —, e o dado desce pra linha
       de apoio sob o nome em vez de sumir da tela. Medida em container query: o que aperta a
       tabela é a largura do card, não a da janela (a sidebar do painel come 236px fixos). */
    @container (max-width: 900px) {
      .og-insc-head,
      .og-insc-main {
        grid-template-columns: var(--insc-avatars-col) minmax(0, 1.7fr) minmax(0, 1fr) 150px 34px;
      }

      .col-date {
        display: none;
      }

      .og-insc-inline-meta {
        display: block;
      }
    }

    @container (max-width: 720px) {
      .og-insc-head,
      .og-insc-main {
        grid-template-columns: var(--insc-avatars-col) minmax(0, 1fr) 150px 34px;
      }

      .col-cat {
        display: none;
      }

      .og-insc-inline-meta .m-cat {
        display: inline;
      }

      /* O recuo alinha a gaveta com a coluna do nome — no card estreito ele custa 74px de uma
         largura que já é a que falta, e os botões de contato passam a cair um por linha. */
      .og-insc-drawer {
        padding-left: 0;
      }
    }
  `,
})
export class OgInscricoesListComponent {
  readonly rows = input.required<readonly InscricaoRow[]>();
  readonly loading = input(false);
  readonly busy = input(false);
  /** Qual ação/inscrição está processando (`'confirm:<id>'`) — o botão certo mostra spinner. */
  readonly busyKey = input<string | null>(null);
  readonly openId = input<string | null>(null);
  readonly emptyTitle = input('Nenhuma inscrição ainda');
  readonly emptyHint = input('');
  readonly canClear = input(false);

  readonly toggled = output<string>();
  readonly action = output<InscricaoAction>();
  readonly cleared = output<void>();

  protected readonly skeletons = [0, 1, 2, 3, 4];
  protected readonly payTone = PAY_TONE;
  protected readonly payLabel = PAY_LABEL;
  protected readonly initialsOf = initialsOf;

  /** Maior stack de avatares nas linhas — largura comum do slot (nomes alinhados). */
  protected readonly maxAvatarStack = computed(() => {
    let max = 1;
    for (const r of this.rows()) {
      const n = Math.min(5, Math.max(1, r.athletes.length));
      if (n > max) max = n;
    }
    return max;
  });

  /** Resposta opcional ao atleta; uma só porque só uma gaveta abre por vez. */
  protected readonly note = signal('');

  /** Telefone copiado por último — troca o rótulo do botão pra "Copiado". */
  protected readonly copiedPhone = signal('');

  /** `phoneOf` roda a cada ciclo de detecção; o cache evita remontar os mesmos links (e devolver
   *  um objeto novo, que faria o `@if … as` piscar) a cada render da gaveta. */
  private readonly phoneCache = new Map<string, PhoneLinks | null>();

  /** A plataforma não devolve dinheiro — o organizador precisa ler isso antes de aprovar. */
  protected readonly refundNotice =
    'Aprovar remove a inscrição e libera a vaga. A nexaGO não processa o reembolso — ' +
    'combine a devolução diretamente com o atleta.';

  constructor() {
    // Trocar de gaveta não pode levar junto o rascunho de resposta escrito pra outra dupla —
    // nem o "Copiado" de um telefone que não está mais na tela.
    effect(() => {
      this.openId();
      this.note.set('');
      this.copiedPhone.set('');
    });
  }

  /** Links de contato do atleta, ou `null` se não há telefone utilizável. */
  protected phoneOf(a: InscricaoAthlete): PhoneLinks | null {
    const raw = a.phone;
    if (!raw) return null;
    const cached = this.phoneCache.get(raw);
    if (cached !== undefined) return cached;

    const whatsapp = whatsAppLink(raw);
    const tel = telLink(raw);
    const links = whatsapp && tel ? { label: formatPhoneBR(raw), whatsapp, tel } : null;
    this.phoneCache.set(raw, links);
    return links;
  }

  /** Copiar serve pro que os links não cobrem: colar num grupo, numa planilha, num sistema de
   *  fora. Sem área de transferência (contexto inseguro, permissão negada) o rótulo não muda —
   *  não adianta dizer "Copiado" quando nada foi. */
  protected async copyPhone(a: InscricaoAthlete): Promise<void> {
    const links = this.phoneOf(a);
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.label);
      this.copiedPhone.set(a.phone);
    } catch {
      /* sem clipboard: o número continua visível e selecionável no botão de ligar */
    }
  }

  /** Contexto da foto ampliada: o que o organizador precisa ler pra confirmar quem é. */
  protected athleteMeta(r: InscricaoRow): string {
    return [r.categoria === '—' ? null : r.categoria, r.name].filter(Boolean).join(' · ');
  }

  protected lgpdTitle(r: InscricaoRow): string {
    return r.lgpdMissing.length > 0
      ? `Sem aceite do termo de imagem: ${r.lgpdMissing.join(', ')}`
      : 'Nenhum aceite do termo de uso de imagem registrado nesta inscrição';
  }

  /** Em `conferir` o organizador não está lançando um pagamento novo: está dando baixa numa
   *  declaração que já garantiu a vaga. O rótulo tem que dizer isso. */
  protected confirmLabel(r: InscricaoRow): string {
    return r.pay === 'conferir' ? 'Confirmar recebimento' : 'Confirmar pagamento';
  }

  protected onNoteInput(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  protected emitAction(kind: InscricaoAction['kind'], row: InscricaoRow): void {
    this.action.emit({ kind, row, note: this.note() });
  }
}
