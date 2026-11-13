import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { bookingCanCheckInNow, bookingCanMarkNoShow } from '../agenda/capacity-hours';
import { applyBookingsOverlay } from '../agenda/arena-schedule-grouping';
import type { ArenaSlot } from '../agenda/arena-slot.model';
import { fetchCourtsRaw, watchArenaDaySlots } from '../agenda/schedule-repository';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { fetchCourtsList } from '../courts/courts-repository';
import type { ArenaCourt } from '../courts/court.model';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import type { PersonPhotoEntry } from '../ui/person-photo.service';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  attendanceLabel,
  bookingCanCancel,
  bookingShowsCheckInAction,
  bookingStatusLabel,
  displayBookingCode,
  enrichCourtName,
  formatBRL,
  formatMemberMinutes,
  professorBookingLabel,
  professorDiscountLabel,
  type ArenaBooking,
} from './arena-booking.model';
import { bookingContactsKey, bookingWhatsappText, fetchBookingContacts, whatsappLink } from './booking-contacts';
import { bookingCanChangeCourt, changeBookingCourt, clubSessionDayLabel, courtAssignOptions } from './booking-court-change';
import {
  bookingCanReschedule,
  bookingDurationMinutes,
  mergeStartOptions,
  RESCHEDULE_HORIZON_DAYS,
  rescheduleBooking,
  rescheduleCourtOptions,
  rescheduleDateBounds,
  rescheduleStartOptions,
  rescheduleSuccessMessage,
} from './booking-reschedule';
import {
  BOOKING_MAX_PLAYERS,
  bookingGuests,
  bookingKindLabel,
  bookingLiveState,
  bookingTakesGuests,
  bookingTimeline,
  durationLabel,
  longDateLabel,
  paymentStatusView,
  perPlayerLabel,
  timelineWhen,
} from './booking-detail';
import {
  cancelBookingByManager,
  checkInBookingByManager,
  markNoShowByManager,
  resolveAthleteProfile,
  restoreBookingByManager,
  watchBooking,
  watchBookingsForArenaInRange,
} from './bookings-repository';

/** Jogador no card "Jogadores": o responsável primeiro, depois quem entrou por convite/link. */
interface BookingPlayer {
  key: string;
  name: string;
  photoUrl: string | null;
  owner: boolean;
  role: string;
  meta: string;
  /** Linha sob o nome na foto ampliada. */
  zoomMeta: string;
  /** `wa.me` com a mensagem da reserva; `null` sem telefone (o botão some). */
  whatsappUrl: string | null;
}

const ATTENDANCE_TONE: Record<string, PillTone | undefined> = {
  checked_in: 'green',
  confirmed: 'orange',
  no_show: 'red',
  pending: 'dim',
};

const UNDO_WINDOW_SECONDS = 60;

/** Canal da reserva para o gestor: o valor cru do doc (`pix`, `card`, `onsite`) em português. */
export function bookingChannelLabel(channel: string | null): string {
  switch (channel) {
    case 'pix':
      return 'PIX';
    case 'card':
      return 'Cartão de crédito';
    case 'onsite':
      return 'No local';
    case null:
      return 'Direto (sem link)';
    default:
      return channel;
  }
}

/** Detalhe de uma reserva (`arenaBookings`) pro gestor — canvas "Reserva · detalhe completo"
 *  (página Arena): horário em destaque com a situação agora, ações da recepção (check-in,
 *  definir/trocar quadra, falta, cancelar com 60s pra desfazer), jogadores com foto ampliada
 *  (setas navegam entre eles), pagamento e linha do tempo. */
@Component({
  selector: 'ar-panel-booking-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent, RouterLink, AvatarComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" [subtitle]="headerSubtitle()">
        @if (resolvedBooking()) {
          <button type="button" class="ar-ghost-btn" (click)="copyCode()">
            <ar-icon name="tag" [size]="14" />
            {{ copied() ? 'Código copiado' : 'Copiar código' }}
          </button>
        }
        <button type="button" class="ar-ghost-btn" (click)="back()">Voltar</button>
      </ar-page-header>

      <div class="body">
        @if (loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando reserva…</p>
          </ar-panel-card>
        } @else if (!resolvedBooking()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Reserva não encontrada.</p>
          </ar-panel-card>
        } @else {
          @let b = resolvedBooking()!;
          @if (errorMessage(); as err) {
            <div class="error-banner" role="alert">{{ err }}</div>
          }
          @if (successMessage(); as ok) {
            <div class="success-banner" role="status">{{ ok }}</div>
          }
          @if (undoSecondsLeft(); as secs) {
            <div class="undo-banner">
              Reserva cancelada. <button type="button" class="undo-link" [disabled]="readOnly()" (click)="restore()">Desfazer</button> ({{ secs }}s)
            </div>
          }

          <div class="layout">
            <div class="stack">
              <section class="card hero" aria-label="Horário da reserva">
                <div class="hero-top">
                  <div class="hero-main">
                    <div class="when">{{ longDate() }}</div>
                    <div class="time">{{ b.startTime }} <span>–</span> {{ b.endTime }}</div>
                    <div class="facts">
                      <b>{{ unassigned() ? 'Quadra a definir' : b.courtName }}</b>
                      @if (b.sportLabel; as sport) { <span>{{ sport }}</span> }
                      <span>{{ duration() }}</span>
                      <span>{{ kind() }}</span>
                    </div>
                    <div class="pills">
                      <ar-pill [tone]="statusTone()">{{ statusLabel(b.status) }}</ar-pill>
                      <ar-pill [tone]="payment().tone">{{ payment().label }}</ar-pill>
                      <ar-pill [tone]="attendanceTone[b.attendanceStatus] ?? 'dim'">{{ attendanceLabel(b.attendanceStatus) }}</ar-pill>
                      @if (professorLabel(); as professor) {
                        <ar-pill tone="blue">{{ professor }}</ar-pill>
                      }
                    </div>
                  </div>
                  <div class="live" [class]="'live tone-' + live().tone">
                    <span class="label">Situação agora</span>
                    <span class="live-v">{{ live().headline }}</span>
                    <span class="live-s">{{ live().detail }}</span>
                    @if (live().progress; as progress) {
                      <div class="bar" role="progressbar" aria-label="Tempo de jogo" [attr.aria-valuenow]="progressPct()" aria-valuemin="0" aria-valuemax="100">
                        <i [style.width.%]="progressPct()"></i>
                      </div>
                      <div class="ticks"><span>{{ b.startTime }}</span><span>{{ b.endTime }}</span></div>
                    }
                  </div>
                </div>

                @if (unassigned()) {
                  <p class="notice">
                    <ar-icon name="alert-triangle" [size]="14" />
                    @if (b.clubSessionId) {
                      <span>O clubinho fica sempre com quadra provisória: hoje na <strong>{{ b.courtName }}</strong>. A equipe troca quando quiser, e o sistema pode trocá-la se uma aula, um plano ou outra reserva precisar dela.</span>
                    } @else {
                      <span>A recepção define a quadra na chegada. Até lá a reserva segura a <strong>{{ b.courtName }}</strong> como provisória — o sistema pode trocá-la se uma aula, um plano ou outra reserva precisar dela.</span>
                    }
                  </p>
                }

                @if (hasActions()) {
                  <div class="hero-actions">
                    @if (showCheckIn()) {
                      <button type="button" class="ar-mini-btn ar-mini-btn-primary act" [disabled]="checkingIn() || readOnly()" (click)="checkIn()">
                        <ar-icon name="check" [size]="15" />
                        {{ checkingIn() ? 'Registrando…' : 'Fazer check-in' }}
                      </button>
                    }
                    @if (canChangeCourt()) {
                      <button type="button" class="ar-mini-btn act" [class.ar-mini-btn-primary]="definable() && !showCheckIn()" [disabled]="readOnly()" (click)="openCourtChange()">
                        <ar-icon name="courts" [size]="15" />
                        {{ definable() ? 'Definir quadra' : 'Trocar quadra' }}
                      </button>
                    }
                    @if (canReschedule()) {
                      <button type="button" class="ar-mini-btn act" (click)="openReschedule()">
                        <ar-icon name="calendar" [size]="15" />
                        Remarcar
                      </button>
                    }
                    @if (canMarkNoShow()) {
                      <button type="button" class="ar-mini-btn act" [disabled]="markingNoShow() || readOnly()" (click)="markNoShow()">
                        {{ markingNoShow() ? 'Marcando…' : 'Marcar falta' }}
                      </button>
                    }
                    @if (b.classSessionId; as classSessionId) {
                      <a class="ar-mini-btn act" [routerLink]="['/painel/aulas/aula', classSessionId]">Abrir aula</a>
                    }
                    <span class="spacer"></span>
                    @if (canCancel()) {
                      <button type="button" class="ar-ghost-btn danger-link" [disabled]="readOnly()" (click)="showCancelConfirm.set(true)">
                        <ar-icon name="alert-triangle" [size]="14" />
                        Cancelar reserva
                      </button>
                    }
                  </div>
                }
              </section>

              @if (!b.classSessionId) {
                <section class="card" aria-label="Jogadores">
                  <div class="card-h">
                    <div>
                      <h2 class="card-title">Jogadores</h2>
                      <div class="count">
                        {{ players().length }}@if (freeSlots().length > 0) { de {{ maxPlayers }}}
                        <small>{{ players().length === 1 ? 'confirmado' : 'confirmados' }}</small>
                      </div>
                    </div>
                    @if (players().length > 1) {
                      <div class="stackav" aria-hidden="true">
                        @for (p of players(); track p.key) {
                          <ar-avatar [name]="p.name" [photoUrl]="p.photoUrl" [size]="30" />
                        }
                      </div>
                    }
                  </div>
                  <div class="players">
                    @for (p of players(); track p.key) {
                      <div class="player" [class.owner]="p.owner">
                        <ar-avatar
                          [class.ring]="p.owner"
                          [name]="p.name"
                          [photoUrl]="p.photoUrl"
                          [size]="56"
                          zoomable
                          [personRole]="p.role"
                          [meta]="p.zoomMeta"
                          [gallery]="gallery()"
                        />
                        <div class="p-main">
                          <div class="p-name">
                            {{ p.name }}
                            @if (p.owner) { <span class="tag">{{ p.role }}</span> }
                          </div>
                          <div class="p-meta">{{ p.meta }}</div>
                        </div>
                        @if (p.whatsappUrl; as wa) {
                          <a class="ar-mini-btn wa-btn" [href]="wa" target="_blank" rel="noopener" [attr.aria-label]="'WhatsApp de ' + p.name">
                            <ar-icon name="message" [size]="14" />
                            WhatsApp
                          </a>
                        }
                      </div>
                    }
                    @for (slot of freeSlots(); track slot) {
                      <div class="empty">
                        <span class="empty-av" aria-hidden="true">+</span>
                        <span>Vaga livre — o responsável pode convidar pelo app até o fim do horário.</span>
                      </div>
                    }
                  </div>
                  @if (gallery().length > 0) {
                    <p class="hint"><ar-icon name="search" [size]="13" />Clique na foto para ampliar e conferir quem chegou.</p>
                  }
                </section>
              }

              <section class="card" aria-label="Linha do tempo">
                <div class="card-h"><h2 class="card-title">Linha do tempo</h2></div>
                @if (timeline().length === 0) {
                  <p class="state-text">Sem eventos registrados nesta reserva.</p>
                } @else {
                  <ol class="tl">
                    @for (e of timeline(); track $index) {
                      <li>
                        <span class="node" [class]="'node n-' + e.tone"><i></i></span>
                        <div class="tl-body">
                          <div class="tl-what">{{ e.title }}</div>
                          @if (e.detail) { <div class="tl-sub">{{ e.detail }}</div> }
                        </div>
                        <span class="tl-when">{{ when(e.at) }}</span>
                      </li>
                    }
                  </ol>
                }
              </section>
            </div>

            <div class="stack side">
              <section class="card" aria-label="Pagamento">
                <div class="card-h">
                  <h2 class="card-title">Pagamento</h2>
                  <ar-pill [tone]="payment().tone">{{ payment().label }}</ar-pill>
                </div>
                @if (b.couponCode; as code) {
                  <div class="row"><span>Cupom {{ code }}</span><b class="mono minus">− {{ formatBRL(b.couponDiscountReais) }}</b></div>
                }
                @if (professorDiscount(); as discount) {
                  <!-- Desconto do vínculo do professor: substitui promoção e cupom (vale o menor preço). -->
                  <div class="row">
                    <span>Desconto professor ({{ discount }})</span>
                    <b class="mono minus">@if (b.professorDiscountReais; as reais) {− {{ formatBRL(reais) }}} @else {aplicado}</b>
                  </div>
                }
                @if (b.athletePricingLabel; as tierLabel) {
                  <!-- Preço por perfil (aluno/professor validado pela arena): não acumula com promoção e cupom. -->
                  <div class="row">
                    <span>Preço {{ tierLabel }}</span>
                    <b class="mono minus">@if (b.athletePricingDiscountReais; as reais) {− {{ formatBRL(reais) }}} @else {aplicado}</b>
                  </div>
                }
                @if (b.memberHoursMinutes) {
                  <!-- Mensalista: horas que saíram do banco de horas do contrato (Clientes). -->
                  <div class="row">
                    <span>Banco de horas · {{ formatMemberMinutes(b.memberHoursMinutes) }}</span>
                    <b class="mono minus">@if (b.memberHoursDiscountReais; as reais) {− {{ formatBRL(reais) }}} @else {aplicado}</b>
                  </div>
                }
                <div class="row"><span>Forma</span><b>{{ channelLabel(b.paymentChannel) }}</b></div>
                <div class="total"><span class="total-l">Total</span><span class="total-v">{{ formatBRL(b.amountReais) }}</span></div>
                @if (perPlayer(); as each) {
                  <div class="split"><span>Por jogador ({{ players().length }} confirmados)</span><b>{{ each }}</b></div>
                }
              </section>

              <section class="card" aria-label="Detalhes">
                <div class="card-h"><h2 class="card-title">Detalhes</h2></div>
                <div class="row"><span>Código</span><b class="mono code">{{ code() }}</b></div>
                <div class="row"><span>Tipo</span><b>{{ kind() }}</b></div>
                @if (unassigned()) {
                  <div class="row"><span>Quadra</span><b class="warn">A definir</b></div>
                  <div class="row"><span>Provisória</span><b>{{ b.courtName }}</b></div>
                } @else {
                  <div class="row"><span>Quadra</span><b>{{ b.courtName }}</b></div>
                }
                @if (b.sportLabel; as sport) {
                  <div class="row"><span>Esporte</span><b>{{ sport }}</b></div>
                }
                <div class="row"><span>Duração</span><b>{{ duration() }}</b></div>
                @if (b.createdAt; as created) {
                  <div class="row"><span>Criada em</span><b class="mono">{{ when(created) }}</b></div>
                }
                @if (b.cancelReason && b.canceledAt) {
                  <div class="row"><span>Motivo do cancelamento</span><b>{{ b.cancelReason }}</b></div>
                }
              </section>
            </div>
          </div>
        }
      </div>

      @if (showCourtChange()) {
        <ar-modal (close)="closeCourtChange()">
          <h2 class="confirm-title">{{ definable() ? 'Definir quadra' : 'Trocar quadra' }}</h2>
          <p class="confirm-body modal-sub">
            {{ booking()!.startTime }}–{{ booking()!.endTime }}@if (booking()!.sportLabel; as sport) { · {{ sport }}} · {{ customerLabel() }}
          </p>

          @if (courtOptions().length === 0) {
            <p class="confirm-body">Nenhuma outra quadra ativa deste esporte.</p>
          } @else {
            <div class="field-label">{{ booking()!.sportLabel ? 'Quadras de ' + booking()!.sportLabel : 'Quadras' }}</div>
            <div class="court-grid" role="radiogroup" [attr.aria-label]="definable() ? 'Quadra' : 'Nova quadra'">
              @for (option of courtOptions(); track option.court.id) {
                <label
                  class="court-tile"
                  [class.provisional]="option.provisional"
                  [class.selected]="targetCourtId() === option.court.id"
                >
                  <input
                    type="radio"
                    name="target-court"
                    [value]="option.court.id"
                    [checked]="targetCourtId() === option.court.id"
                    (change)="targetCourtId.set(option.court.id)"
                  />
                  <span class="tile-name">{{ option.court.name }}</span>
                  <span class="tile-tag">{{ targetCourtId() === option.court.id ? 'selecionada' : option.provisional ? 'provisória' : '' }}</span>
                </label>
              }
            </div>
            <p class="modal-hint">
              Se a quadra estiver ocupada nesse horário, o sistema avisa ao confirmar. Outra reserva sem quadra definida que estiver nela vai para uma quadra livre.
            </p>
            @if (booking()!.clubSessionId) {
              <p class="notice club-scope" data-testid="club-court-change-scope">
                <ar-icon name="alert-triangle" [size]="14" />
                <span>Muda só a sessão de <strong>{{ clubDay() }}</strong>. As próximas seguem nas quadras do clubinho.</span>
              </p>
            }
          }

          <div class="field-label">Motivo (opcional)</div>
          <input
            type="text"
            class="input-box"
            placeholder="Ex.: quadra 3 com a rede quebrada"
            [value]="courtChangeReason()"
            (input)="courtChangeReason.set($any($event.target).value)"
          />

          @if (booking()!.clubSessionId && targetCourtName(); as name) {
            <p class="notice notice-info">
              <ar-icon name="bell" [size]="14" />
              <span>Os participantes do clubinho recebem um aviso: “{{ booking()!.courtName }} mudou para {{ name }}”.</span>
            </p>
          }
          @if (booking()!.athleteId && targetCourtName(); as name) {
            <p class="notice notice-info">
              <ar-icon name="bell" [size]="14" />
              <span>O atleta recebe um aviso: “Sua quadra: {{ name }}”.</span>
            </p>
          }

          @if (courtChangeError(); as err) {
            <div class="error-banner modal-error">{{ err }}</div>
          }

          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="changingCourt()" (click)="closeCourtChange()">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="changingCourt() || !targetCourtId()" (click)="changeCourt()">
              <ar-icon name="check" [size]="14" />
              {{ changingCourt() ? 'Salvando…' : targetCourtName() ? 'Confirmar ' + targetCourtName() : 'Confirmar' }}
            </button>
          </div>
        </ar-modal>
      }

      @if (showReschedule()) {
        <ar-modal (close)="closeReschedule()">
          <h2 class="confirm-title">Remarcar reserva</h2>
          <p class="confirm-body modal-sub">
            Hoje: {{ rescheduleCurrentLabel() }} · {{ customerLabel() }}. A duração e o valor da reserva continuam os mesmos.
          </p>

          <div class="field-label">Novo dia</div>
          <input
            type="date"
            class="input-box"
            data-testid="reschedule-date"
            [min]="rescheduleBounds().min"
            [max]="rescheduleBounds().max"
            [value]="rescheduleDate()"
            (change)="setRescheduleDate($any($event.target).value)"
          />

          @if (!unassigned()) {
            <div class="field-label">Quadra</div>
            <select class="input-box" data-testid="reschedule-court" (change)="setRescheduleCourt($any($event.target).value)">
              @for (court of rescheduleCourts(); track court.id) {
                <option [value]="court.id" [selected]="court.id === rescheduleCourtId()">
                  {{ court.name }}{{ court.id === booking()!.courtId ? ' (atual)' : '' }}
                </option>
              }
            </select>
          }

          <div class="field-label">Horário</div>
          @if (rescheduleSlotsLoading()) {
            <p class="modal-hint">Carregando horários…</p>
          } @else if (rescheduleOptions().length === 0) {
            <p class="modal-hint">Nenhum horário livre nesse dia{{ unassigned() ? '' : ' nesta quadra' }}. Escolha outro dia{{ unassigned() ? '' : ' ou outra quadra' }}.</p>
          } @else {
            <div class="court-grid time-grid" role="radiogroup" aria-label="Novo horário">
              @for (option of rescheduleOptions(); track option.startTime) {
                <label class="court-tile" [class.selected]="rescheduleStart() === option.startTime">
                  <input
                    type="radio"
                    name="reschedule-start"
                    [value]="option.startTime"
                    [checked]="rescheduleStart() === option.startTime"
                    (change)="rescheduleStart.set(option.startTime)"
                  />
                  <span class="tile-name">{{ option.startTime }}–{{ option.endTime }}</span>
                </label>
              }
            </div>
            <p class="modal-hint">
              {{ unassigned() ? 'A quadra continua a definir: o sistema escolhe uma livre no novo horário.' : 'Se o horário for ocupado nesse meio-tempo, o sistema avisa ao confirmar.' }}
            </p>
          }

          <div class="field-label">Motivo (opcional)</div>
          <textarea
            class="input-box textarea-box"
            rows="2"
            placeholder="Ex.: cliente pediu por WhatsApp"
            [value]="rescheduleReason()"
            (input)="rescheduleReason.set($any($event.target).value)"
          ></textarea>

          @if (booking()!.athleteId) {
            <p class="notice notice-info">
              <ar-icon name="bell" [size]="14" />
              <span>O atleta recebe um aviso com o novo horário.</span>
            </p>
          }

          @if (rescheduleError(); as err) {
            <div class="error-banner modal-error">{{ err }}</div>
          }

          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="rescheduling()" (click)="closeReschedule()">Voltar</button>
            <button
              type="button"
              class="ar-mini-btn ar-mini-btn-primary confirm-btn"
              [disabled]="rescheduling() || !rescheduleChosen()"
              (click)="reschedule()"
            >
              <ar-icon name="check" [size]="14" />
              {{ rescheduling() ? 'Salvando…' : rescheduleChosen() ? 'Remarcar para ' + rescheduleChosen()!.startTime : 'Remarcar' }}
            </button>
          </div>
        </ar-modal>
      }

      @if (showCancelConfirm()) {
        <ar-modal (close)="showCancelConfirm.set(false)">
          <h2 class="confirm-title">Cancelar reserva?</h2>
          <p class="confirm-body">O horário volta a ficar disponível na agenda. Você pode desfazer nos 60s seguintes ao cancelamento.</p>

          <div class="field-label">Motivo (opcional)</div>
          <input
            type="text"
            class="input-box"
            placeholder="Ex.: cliente pediu por WhatsApp"
            [value]="cancelReason()"
            (input)="cancelReason.set($any($event.target).value)"
          />

          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="canceling()" (click)="showCancelConfirm.set(false)">Voltar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="canceling()" (click)="cancel()">
              {{ canceling() ? 'Cancelando…' : 'Confirmar cancelamento' }}
            </button>
          </div>
        </ar-modal>
      }
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
    }

    .error-banner,
    .success-banner,
    .undo-banner {
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .error-banner {
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }

    .success-banner {
      border: 1px solid var(--nx-win);
      background: rgba(47, 179, 107, 0.1);
      color: var(--nx-text);
    }

    .modal-error {
      margin-bottom: 16px;
    }

    .modal-sub {
      margin-bottom: 18px;
    }

    .court-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
      gap: 8px;
    }

    .court-tile {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-height: 56px;
      padding: 0 12px;
      border-radius: 12px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      cursor: pointer;
    }

    .court-tile input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
    }

    .court-tile:focus-within {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .tile-name {
      font-size: 13px;
      font-weight: 600;
    }

    .tile-tag {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .court-tile.provisional {
      border-style: dashed;
      border-color: rgba(244, 197, 67, 0.55);
    }

    .court-tile.provisional .tile-tag {
      color: #f4c543;
    }

    .court-tile.selected {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: #0a0a0a;
    }

    .court-tile.selected .tile-tag {
      color: rgba(10, 10, 10, 0.7);
    }

    .time-grid {
      grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
      max-height: 232px;
      overflow: auto;
      padding: 2px;
    }

    .textarea-box {
      height: auto;
      min-height: 64px;
      padding: 10px 14px;
      resize: vertical;
    }

    .modal-hint {
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
      margin: 10px 0 18px;
    }

    .notice {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin: 14px 0 0;
      padding: 12px 14px;
      border-radius: var(--nx-r-2);
      border: 1px solid rgba(244, 197, 67, 0.3);
      background: rgba(244, 197, 67, 0.06);
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.5;
    }

    .notice strong {
      color: var(--nx-text);
    }

    .club-scope {
      margin: 0 0 14px;
    }

    .notice-info {
      margin: 0 0 18px;
      border-color: var(--nx-line);
      background: var(--nx-surface-1);
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }

    .undo-banner {
      border: 1px solid rgba(244, 197, 67, 0.3);
      background: rgba(244, 197, 67, 0.1);
      color: var(--nx-text);
    }

    .undo-link {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-orange-500);
      font-weight: 700;
      text-decoration: underline;
      padding: 0;
      font-size: inherit;
      font-family: inherit;
    }

    .undo-link:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 20px;
      align-items: start;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }

    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: 18px;
      padding: 22px 24px;
    }

    .card-h {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0;
    }

    .label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    /* Hero: o horário em destaque + "situação agora" + ações da recepção. */
    .hero {
      padding: 0;
      overflow: hidden;
    }

    .hero-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 24px;
      padding: 26px 28px 22px;
    }

    .when {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-400);
    }

    .time {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 52px;
      letter-spacing: -0.03em;
      line-height: 1;
      color: var(--nx-text);
      margin: 12px 0 10px;
    }

    .time span {
      color: var(--nx-text-dim);
      font-weight: 600;
    }

    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 18px;
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .facts b {
      color: var(--nx-text);
      font-weight: 600;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }

    .live {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-self: start;
      padding: 16px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .live.tone-live {
      border-color: rgba(255, 106, 26, 0.45);
    }

    .live-v {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 24px;
      color: var(--nx-text);
    }

    .live.tone-live .live-v {
      color: var(--nx-orange-400);
    }

    .live.tone-canceled .live-v {
      color: var(--nx-live);
    }

    .live-s {
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--nx-text-mute);
    }

    .bar {
      height: 6px;
      border-radius: 999px;
      background: var(--nx-surface-2);
      overflow: hidden;
      margin-top: 4px;
    }

    .bar i {
      display: block;
      height: 100%;
      background: var(--nx-orange-500);
    }

    .ticks {
      display: flex;
      justify-content: space-between;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }

    .hero .notice {
      margin: 0 28px 22px;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 16px 28px;
      border-top: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
    }

    .hero-actions .act {
      height: 44px;
      padding: 0 18px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }

    .spacer {
      flex: 1;
    }

    /* Jogadores */
    .count {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      margin-top: 6px;
    }

    .count small {
      font-family: var(--nx-font-ui);
      font-weight: 500;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin-left: 4px;
    }

    .stackav {
      display: flex;
    }

    .stackav ar-avatar {
      border: 2px solid var(--nx-surface-0);
      margin-left: -8px;
    }

    .stackav ar-avatar:first-child {
      margin-left: 0;
    }

    .players {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .player {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
      padding: 14px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .player.owner {
      border-color: rgba(255, 106, 26, 0.35);
      background: rgba(255, 106, 26, 0.05);
    }

    .player ar-avatar.ring {
      box-shadow:
        0 0 0 2px var(--nx-surface-0),
        0 0 0 4px var(--nx-orange-500);
    }

    .p-main {
      min-width: 0;
      flex: 1;
    }

    .p-name {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-weight: 600;
      font-size: 14.5px;
      color: var(--nx-text);
    }

    .wa-btn {
      flex: none;
      text-decoration: none;
    }

    .p-meta {
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-top: 4px;
    }

    .tag {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-400);
    }

    .empty {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px;
      border-radius: 14px;
      border: 1px dashed var(--nx-line-strong);
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.45;
    }

    .empty-av {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 1.5px dashed var(--nx-line-strong);
      display: grid;
      place-items: center;
      font-size: 20px;
      color: var(--nx-text-dim);
    }

    .hint {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 14px 0 0;
    }

    /* Linha do tempo */
    .tl {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .tl li {
      position: relative;
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr) auto;
      gap: 12px;
      padding-bottom: 18px;
    }

    .tl li:last-child {
      padding-bottom: 0;
    }

    .tl li:not(:last-child)::before {
      content: '';
      position: absolute;
      left: 9px;
      top: 20px;
      bottom: 0;
      width: 1px;
      background: var(--nx-line);
    }

    .node {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      display: grid;
      place-items: center;
    }

    .node i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-orange-500);
    }

    .node.n-green i {
      background: var(--nx-win);
    }

    .node.n-yellow i {
      background: #f4c543;
    }

    .node.n-red i {
      background: var(--nx-live);
    }

    .node.n-dim i {
      background: var(--nx-text-dim);
    }

    .tl-what {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .tl-sub {
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }

    .tl-when {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }

    /* Coluna lateral */
    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .row:last-child {
      border-bottom: none;
    }

    .row b {
      color: var(--nx-text);
      font-weight: 600;
      text-align: right;
    }

    .row b.mono {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
    }

    .row b.minus {
      color: var(--nx-win);
    }

    .row b.code {
      color: var(--nx-orange-400);
    }

    .row b.warn {
      color: #f4c543;
    }

    .total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-top: 6px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line-strong);
    }

    .total-l {
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .total-v {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .split {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--nx-surface-1);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .split b {
      font-family: var(--nx-font-display);
      font-size: 15px;
      color: var(--nx-text);
    }

    .danger-link {
      color: var(--nx-live);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .confirm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 16px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
      width: 100%;
      height: 44px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
      margin-bottom: 22px;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .danger-btn {
      height: 44px;
      padding: 0 20px;
      background: var(--nx-live);
      color: #fff;
      border: none;
    }

    .danger-btn:hover:not(:disabled) {
      background: #ff564c;
    }

    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 760px) {
      .body {
        padding: 16px;
      }
      .hero-top {
        grid-template-columns: 1fr;
        padding: 20px;
      }
      .hero-actions {
        padding: 14px 20px;
      }
      .hero .notice {
        margin: 0 20px 18px;
      }
      .time {
        font-size: 40px;
      }
      .players {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelBookingDetailComponent {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  /** Cargo com leitura mas sem escrita em `agenda` (manutenção): check-in/cancelamento
   *  ficam indisponíveis — só visualizar a reserva segue liberado. */
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));

  protected readonly attendanceTone = ATTENDANCE_TONE;
  protected readonly formatBRL = formatBRL;
  protected readonly formatMemberMinutes = formatMemberMinutes;
  protected readonly attendanceLabel = attendanceLabel;
  protected readonly statusLabel = bookingStatusLabel;
  protected readonly displayBookingCode = displayBookingCode;
  protected readonly channelLabel = bookingChannelLabel;

  protected readonly loading = signal(true);
  protected readonly booking = signal<ArenaBooking | null>(null);
  protected readonly courts = signal<readonly ArenaCourt[]>([]);
  protected readonly courtNames = computed<ReadonlyMap<string, string>>(
    () => new Map(this.courts().map((c) => [c.id, c.name])),
  );
  protected readonly athleteLabel = signal<string | null>(null);
  protected readonly athletePhoto = signal<string | null>(null);
  /** Fotos dos convidados que entraram sem `avatarUrl` na reserva (busca no perfil público). */
  private readonly guestPhotos = signal<ReadonlyMap<string, string | null>>(new Map());
  /** WhatsApp dos jogadores (uid → dígitos), pela callable: o telefone não está no doc. */
  private readonly contacts = signal<ReadonlyMap<string, string>>(new Map());
  private contactsKey: string | null = null;
  protected readonly maxPlayers = BOOKING_MAX_PLAYERS;
  protected readonly markingNoShow = signal(false);
  protected readonly copied = signal(false);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly checkingIn = signal(false);
  protected readonly canceling = signal(false);
  protected readonly showCancelConfirm = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly successMessage = signal<string | null>(null);

  protected readonly showCourtChange = signal(false);
  protected readonly targetCourtId = signal<string | null>(null);
  protected readonly courtChangeReason = signal('');
  protected readonly changingCourt = signal(false);
  protected readonly courtChangeError = signal<string | null>(null);

  protected readonly showReschedule = signal(false);
  protected readonly rescheduleDate = signal('');
  protected readonly rescheduleCourtId = signal<string | null>(null);
  protected readonly rescheduleStart = signal<string | null>(null);
  protected readonly rescheduleReason = signal('');
  protected readonly rescheduling = signal(false);
  protected readonly rescheduleError = signal<string | null>(null);
  /** Grade do dia escolhido no modal (slots + reservas do dia), só enquanto o modal está aberto. */
  private readonly rescheduleSlots = signal<ArenaSlot[] | null>(null);
  private readonly rescheduleDayBookings = signal<ArenaBooking[] | null>(null);
  /** Quadras com os dados crus (horário de funcionamento, duração do slot) para a grade. */
  private readonly courtsRaw = signal<{ id: string; data: Record<string, unknown> }[] | null>(null);

  protected readonly undoDeadlineMs = signal<number | null>(null);
  protected readonly nowTick = signal(Date.now());
  /** Relógio de minuto: o que só muda de minuto em minuto não recalcula a cada segundo. */
  private readonly nowMinute = computed(() => Math.floor(this.nowTick() / 60_000));

  private unsubscribeBooking: (() => void) | null = null;
  private undoInterval: ReturnType<typeof setInterval> | null = null;

  protected readonly resolvedBooking = computed(() => {
    const b = this.booking();
    if (!b) return null;
    return enrichCourtName(b, this.courtNames());
  });

  protected readonly showCheckIn = computed(() => {
    const b = this.resolvedBooking();
    return b != null && bookingShowsCheckInAction(b) && this.checkInOpen();
  });

  protected readonly canCancel = computed(() => {
    const b = this.resolvedBooking();
    return b != null && bookingCanCancel(b) && this.undoDeadlineMs() == null;
  });

  protected readonly canChangeCourt = computed(() => {
    const b = this.booking();
    return b != null && bookingCanChangeCourt(b) && this.undoDeadlineMs() == null;
  });

  /** Remarcar: só reserva avulsa e equipe com escrita na agenda (o servidor confere de novo). */
  protected readonly canReschedule = computed(() => {
    const b = this.booking();
    return (
      b != null &&
      !this.readOnly() &&
      this.undoDeadlineMs() == null &&
      bookingCanReschedule(b, this.nowMinute() * 60_000)
    );
  });

  protected readonly rescheduleBounds = computed(() => rescheduleDateBounds(new Date(this.nowMinute() * 60_000)));
  protected readonly rescheduleCourts = computed(() => {
    const b = this.booking();
    return b ? rescheduleCourtOptions(b, this.courts()) : [];
  });
  protected readonly rescheduleCurrentLabel = computed(() => {
    const b = this.booking();
    return b ? `${clubSessionDayLabel(b.dateKey)}, ${b.startTime}–${b.endTime}` : '';
  });
  protected readonly rescheduleSlotsLoading = computed(
    () => this.rescheduleSlots() == null || this.rescheduleDayBookings() == null,
  );

  /** Inícios livres no dia escolhido. Reserva sem quadra definida: qualquer quadra do esporte
   *  serve (o servidor escolhe); com quadra: só a escolhida no select. */
  protected readonly rescheduleOptions = computed(() => {
    const b = this.booking();
    const slots = this.rescheduleSlots();
    const dayBookings = this.rescheduleDayBookings();
    const dateKey = this.rescheduleDate();
    const duration = b ? bookingDurationMinutes(b) : null;
    if (!b || !slots || !dayBookings || !dateKey || duration == null) return [];
    const overlaid = applyBookingsOverlay(slots, dayBookings);
    const now = new Date(this.nowMinute() * 60_000);
    const courtIds = this.unassigned()
      ? this.rescheduleCourts().map((c) => c.id)
      : [this.rescheduleCourtId() ?? b.courtId];
    return mergeStartOptions(
      courtIds.map((courtId) =>
        rescheduleStartOptions({ slots: overlaid, courtId, dateKey, durationMinutes: duration, booking: b, now }),
      ),
    );
  });

  protected readonly rescheduleChosen = computed(() => {
    const start = this.rescheduleStart();
    return this.rescheduleOptions().find((o) => o.startTime === start) ?? null;
  });

  /** Reserva no modo "a arena define a quadra" ainda sem quadra definida. */
  protected readonly unassigned = computed(() => this.booking()?.allocationStatus === 'unassigned');
  /** Provisória que a equipe pode fixar ("Definir quadra"). O clubinho fica sempre provisório. */
  protected readonly definable = computed(() => this.unassigned() && !this.booking()?.clubSessionId);
  /** Dia da sessão do clubinho ("sex, 14/11"): a troca vale só para ela. */
  protected readonly clubDay = computed(() => clubSessionDayLabel(this.booking()?.dateKey ?? ''));

  protected readonly courtOptions = computed(() => {
    const b = this.booking();
    return b ? courtAssignOptions(b, this.courts()) : [];
  });

  protected readonly targetCourtName = computed(() => {
    const id = this.targetCourtId();
    return this.courtOptions().find((o) => o.court.id === id)?.court.name ?? null;
  });

  protected readonly undoSecondsLeft = computed(() => {
    const deadline = this.undoDeadlineMs();
    if (deadline == null) return null;
    const left = Math.ceil((deadline - this.nowTick()) / 1000);
    return left > 0 ? left : null;
  });

  protected readonly code = computed(() => displayBookingCode(this.booking()?.id ?? '').replace('#', ''));
  protected readonly longDate = computed(() => longDateLabel(this.booking()?.dateKey ?? ''));
  protected readonly duration = computed(() => {
    const b = this.booking();
    return b ? durationLabel(b.startTime, b.endTime) : '';
  });
  protected readonly kind = computed(() => {
    const b = this.booking();
    return b ? bookingKindLabel(b) : '';
  });
  protected readonly payment = computed(() => {
    const b = this.booking();
    return paymentStatusView(b?.paymentStatus ?? null, b?.paymentChannel ?? null);
  });
  protected readonly statusTone = computed<PillTone>(() => {
    const s = this.booking()?.status.toLowerCase().trim() ?? '';
    if (s === 'canceled' || s === 'cancelled') return 'red';
    if (s === 'pending_payment') return 'yellow';
    if (s === 'completed') return 'dim';
    return 'green';
  });
  /** Atualiza a cada segundo junto com o relógio do "desfazer" — barato, é só aritmética. */
  protected readonly live = computed(() => {
    const b = this.booking();
    return b
      ? bookingLiveState(b, new Date(this.nowTick()))
      : { headline: '', detail: '', progress: null, tone: 'done' as const };
  });
  protected readonly progressPct = computed(() => Math.round((this.live().progress ?? 0) * 100));

  /** Na janela da recepção (20 min antes até 15 min depois do fim) — a mesma da agenda Por horário;
   *  fora dela o `checkInBookingByManager` recusaria. */
  private readonly checkInOpen = computed(() => {
    const b = this.booking();
    return b != null && bookingCanCheckInNow(b, new Date(this.nowTick()));
  });

  protected readonly canMarkNoShow = computed(() => {
    const b = this.booking();
    return b != null && this.undoDeadlineMs() == null && bookingCanMarkNoShow(b, new Date(this.nowTick()));
  });
  protected readonly hasActions = computed(
    () => this.showCheckIn() || this.canChangeCourt() || this.canReschedule() || this.canMarkNoShow() || this.canCancel() || !!this.booking()?.classSessionId,
  );
  protected readonly takesGuests = computed(() => {
    const b = this.booking();
    return b != null && bookingTakesGuests(b);
  });

  protected readonly players = computed<BookingPlayer[]>(() => {
    const b = this.resolvedBooking();
    if (!b) return [];
    const where = `${b.courtName} · ${b.startTime}–${b.endTime}`;
    const contacts = this.contacts();
    const arenaName = this.arenaContext.arenaName();
    const wa = (uid: string, name: string) => {
      const digits = contacts.get(uid);
      return digits ? whatsappLink(digits, bookingWhatsappText(b, name, arenaName)) : null;
    };
    const owner: BookingPlayer = b.athleteId
      ? {
          key: b.athleteId,
          name: this.customerLabel(),
          photoUrl: this.athletePhoto(),
          owner: true,
          role: b.bookedAsProfessor ? 'Professor responsável' : 'Responsável',
          meta: b.createdAt ? `Reservou em ${timelineWhen(b.createdAt).replace(' · ', ' às ')}` : 'Responsável pela reserva',
          zoomMeta: `${where} · responsável`,
          whatsappUrl: wa(b.athleteId, this.customerLabel()),
        }
      : {
          key: 'customer',
          name: this.customerLabel(),
          photoUrl: null,
          owner: true,
          role: 'Cliente',
          meta: 'Reserva feita na recepção · sem conta no app',
          zoomMeta: where,
          whatsappUrl: null,
        };
    const guests = bookingGuests(b).map<BookingPlayer>((p) => ({
      key: p.uid,
      name: p.name,
      photoUrl: p.avatarUrl ?? this.guestPhotos().get(p.uid) ?? null,
      owner: false,
      role: p.source === 'result' ? 'Jogador' : 'Convidado',
      meta:
        p.source === 'result'
          ? 'Adicionado no placar do jogo'
          : `${p.source === 'link' ? 'Entrou pelo link' : 'Convidado'}${p.joinedAt ? ` · ${timelineWhen(p.joinedAt).replace(' · ', ' às ')}` : ''}`,
      zoomMeta: `${where} · ${p.source === 'result' ? 'no placar' : p.source === 'link' ? 'entrou pelo link' : 'convidado'}`,
      whatsappUrl: wa(p.uid, p.name),
    }));
    return [owner, ...guests];
  });

  /** Vagas livres até lotar (dono + 3), só em reserva que aceita convidado e ainda não acabou
   *  (o convite vale até o fim do horário). */
  protected readonly freeSlots = computed(() => {
    const tone = this.live().tone;
    if (!this.takesGuests() || (tone !== 'upcoming' && tone !== 'live')) return [];
    const free = Math.max(0, BOOKING_MAX_PLAYERS - this.players().length);
    return Array.from({ length: free }, (_, i) => i);
  });

  /** Fotos que dá pra ampliar, na ordem do card — o visualizador navega entre elas. */
  protected readonly gallery = computed<PersonPhotoEntry[]>(() =>
    this.players()
      .filter((p): p is BookingPlayer & { photoUrl: string } => !!p.photoUrl)
      .map((p) => ({ photoUrl: p.photoUrl, role: p.role, name: p.name, meta: p.zoomMeta })),
  );

  protected readonly perPlayer = computed(() => perPlayerLabel(this.booking()?.amountReais ?? null, this.players().length));

  protected readonly timeline = computed(() => {
    const b = this.resolvedBooking();
    return b ? bookingTimeline(b, this.customerLabel()) : [];
  });

  protected readonly when = timelineWhen;

  protected readonly headerTitle = computed(() => {
    const b = this.resolvedBooking();
    return b ? `Reserva ${this.displayBookingCode(b.id)}` : 'Reserva';
  });

  protected readonly headerSubtitle = computed(() => {
    const b = this.resolvedBooking();
    if (!b) return '';
    const court = b.allocationStatus === 'unassigned' ? 'Quadra a definir' : b.courtName;
    return `${court} · ${longDateLabel(b.dateKey)}`;
  });

  /** Reserva feita como professor: "Professor · equipe da arena" / "Professor · independente". */
  protected readonly professorDiscount = computed(() => {
    const b = this.booking();
    return b ? professorDiscountLabel(b) : null;
  });
  protected readonly professorLabel = computed(() => {
    const b = this.resolvedBooking();
    return b ? professorBookingLabel(b) : null;
  });

  protected readonly customerLabel = computed(() => {
    const b = this.resolvedBooking();
    if (!b) return '';
    if (b.customerName) return b.customerName;
    if (!b.athleteId) return 'Cliente';
    return this.athleteLabel() ?? 'Carregando…';
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const bookingId = this.id();
      this.unsubscribeBooking?.();
      this.unsubscribeBooking = null;
      this.booking.set(null);
      this.loading.set(true);
      if (!arenaId || !bookingId) return;

      const db = arenaFirestore();
      void fetchCourtsList(db, arenaId).then((courts) => this.courts.set(courts));
      this.unsubscribeBooking = watchBooking(db, bookingId, (booking) => {
        this.booking.set(booking);
        this.loading.set(false);
        if (booking?.athleteId) {
          void resolveAthleteProfile(db, booking.athleteId).then((profile) => {
            this.athleteLabel.set(profile.name);
            this.athletePhoto.set(profile.photoUrl);
          });
        }
        this.resolveGuestPhotos(db, booking);
        this.resolveContacts(booking);
        if (booking?.canceledAt && (booking.status === 'canceled' || booking.status === 'cancelled')) {
          const deadline = booking.canceledAt.getTime() + UNDO_WINDOW_SECONDS * 1000;
          this.undoDeadlineMs.set(deadline > Date.now() ? deadline : null);
        } else {
          this.undoDeadlineMs.set(null);
        }
      });
    });

    // Grade do dia escolhido no modal "Remarcar": slots das quadras + reservas do dia, ao vivo.
    let unsubscribeRescheduleSlots: (() => void) | null = null;
    let unsubscribeRescheduleBookings: (() => void) | null = null;
    effect(() => {
      const open = this.showReschedule();
      const arenaId = this.arenaContext.arenaId();
      const dateKey = this.rescheduleDate();
      const courts = this.courtsRaw();
      unsubscribeRescheduleSlots?.();
      unsubscribeRescheduleBookings?.();
      unsubscribeRescheduleSlots = null;
      unsubscribeRescheduleBookings = null;
      this.rescheduleSlots.set(null);
      this.rescheduleDayBookings.set(null);
      const [y, m, d] = dateKey.split('-').map(Number);
      if (!open || !arenaId || !courts || !y || !m || !d) return;
      const db = arenaFirestore();
      unsubscribeRescheduleSlots = watchArenaDaySlots(db, arenaId, new Date(y, m - 1, d), dateKey, courts, (slots) =>
        this.rescheduleSlots.set(slots),
      );
      unsubscribeRescheduleBookings = watchBookingsForArenaInRange(db, arenaId, { fromKey: dateKey, toKey: dateKey }, (list) =>
        this.rescheduleDayBookings.set(list),
      );
    });

    this.undoInterval = setInterval(() => this.nowTick.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => {
      unsubscribeRescheduleSlots?.();
      unsubscribeRescheduleBookings?.();
      this.unsubscribeBooking?.();
      if (this.undoInterval) clearInterval(this.undoInterval);
    });
  }

  /** Volta pra onde o gestor veio (agenda, lista de reservas, CRM); aberta direto pelo link,
   *  cai na lista de reservas. */
  protected back(): void {
    if (this.router.lastSuccessfulNavigation?.previousNavigation) {
      this.location.back();
      return;
    }
    void this.router.navigate(['/painel/reservas']);
  }

  protected async copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.errorMessage.set('Não foi possível copiar o código.');
    }
  }

  protected async markNoShow(): Promise<void> {
    const b = this.booking();
    if (!b || this.readOnly()) return;
    this.markingNoShow.set(true);
    this.errorMessage.set(null);
    try {
      await markNoShowByManager(arenaFirestore(), b.id);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível marcar a falta.');
    } finally {
      this.markingNoShow.set(false);
    }
  }

  /** Convidado gravado sem `avatarUrl` (app antigo): a foto sai do perfil público, com cache. */
  /** Busca de novo só quando muda quem joga (alguém entrou). Falha (callable fora do ar,
   *  sem acesso) só esconde o botão. */
  private resolveContacts(booking: ArenaBooking | null): void {
    const key = bookingContactsKey(booking);
    if (key === this.contactsKey) return;
    this.contactsKey = key;
    if (!booking || !key) {
      this.contacts.set(new Map());
      return;
    }
    fetchBookingContacts(arenaFunctions(), booking.id)
      .then((contacts) => {
        if (this.contactsKey === key) this.contacts.set(contacts);
      })
      .catch(() => undefined);
  }

  private resolveGuestPhotos(db: ReturnType<typeof arenaFirestore>, booking: ArenaBooking | null): void {
    const missing = (booking ? bookingGuests(booking) : []).filter((p) => !p.avatarUrl && !this.guestPhotos().has(p.uid));
    for (const p of missing) {
      void resolveAthleteProfile(db, p.uid).then((profile) => {
        this.guestPhotos.update((m) => new Map(m).set(p.uid, profile.photoUrl));
      });
    }
  }

  protected async checkIn(): Promise<void> {
    const b = this.booking();
    if (!b || this.readOnly()) return;
    this.checkingIn.set(true);
    this.errorMessage.set(null);
    try {
      await checkInBookingByManager(arenaFirestore(), b.id);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível fazer check-in.');
    } finally {
      this.checkingIn.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    const b = this.booking();
    const arenaId = this.arenaContext.arenaId();
    if (!b || !arenaId || this.readOnly()) return;
    this.canceling.set(true);
    this.errorMessage.set(null);
    try {
      await cancelBookingByManager(arenaFirestore(), b.id, arenaId, this.cancelReason().trim() || undefined);
      this.showCancelConfirm.set(false);
      this.cancelReason.set('');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível cancelar a reserva.');
    } finally {
      this.canceling.set(false);
    }
  }

  protected openCourtChange(): void {
    if (this.readOnly()) return;
    const options = this.courtOptions();
    this.targetCourtId.set(options.length === 1 ? options[0]!.court.id : null);
    this.courtChangeReason.set('');
    this.courtChangeError.set(null);
    this.successMessage.set(null);
    this.showCourtChange.set(true);
  }

  protected closeCourtChange(): void {
    if (this.changingCourt()) return;
    this.showCourtChange.set(false);
  }

  protected async changeCourt(): Promise<void> {
    const b = this.booking();
    const toCourtId = this.targetCourtId();
    if (!b || !toCourtId || this.readOnly()) return;
    this.changingCourt.set(true);
    this.courtChangeError.set(null);
    try {
      const result = await changeBookingCourt(arenaFunctions(), {
        bookingId: b.id,
        toCourtId,
        reason: this.courtChangeReason().trim() || null,
      });
      this.showCourtChange.set(false);
      const done = result.assigned ? `Quadra definida: ${result.courtName}.` : `Reserva movida para ${result.courtName}.`;
      this.successMessage.set(b.athleteId && result.changed ? `${done} O atleta foi avisado.` : done);
    } catch (err) {
      this.courtChangeError.set(err instanceof Error ? err.message : 'Não foi possível trocar a quadra.');
    } finally {
      this.changingCourt.set(false);
    }
  }

  protected openReschedule(): void {
    const b = this.booking();
    const arenaId = this.arenaContext.arenaId();
    if (!b || !arenaId || this.readOnly()) return;
    if (this.courtsRaw() == null) {
      void fetchCourtsRaw(arenaFirestore(), arenaId)
        .then((list) => this.courtsRaw.set(list))
        .catch(() => this.rescheduleError.set('Não foi possível carregar as quadras.'));
    }
    const { min } = this.rescheduleBounds();
    this.rescheduleDate.set(b.dateKey >= min ? b.dateKey : min);
    this.rescheduleCourtId.set(b.courtId || null);
    this.rescheduleStart.set(null);
    this.rescheduleReason.set('');
    this.rescheduleError.set(null);
    this.successMessage.set(null);
    this.showReschedule.set(true);
  }

  protected closeReschedule(): void {
    if (this.rescheduling()) return;
    this.showReschedule.set(false);
  }

  protected setRescheduleDate(value: string): void {
    const { min, max } = this.rescheduleBounds();
    if (!value || value < min || value > max) {
      this.rescheduleError.set(`Escolha um dia de hoje até ${RESCHEDULE_HORIZON_DAYS} dias à frente.`);
      return;
    }
    this.rescheduleError.set(null);
    this.rescheduleDate.set(value);
    this.rescheduleStart.set(null);
  }

  protected setRescheduleCourt(courtId: string): void {
    this.rescheduleCourtId.set(courtId || null);
    this.rescheduleStart.set(null);
  }

  protected async reschedule(): Promise<void> {
    const b = this.booking();
    const chosen = this.rescheduleChosen();
    if (!b || !chosen || this.readOnly()) return;
    const courtId = this.rescheduleCourtId();
    this.rescheduling.set(true);
    this.rescheduleError.set(null);
    try {
      const result = await rescheduleBooking(arenaFunctions(), {
        bookingId: b.id,
        date: this.rescheduleDate(),
        startTime: chosen.startTime,
        ...(!this.unassigned() && courtId && courtId !== b.courtId ? { courtId } : {}),
        ...(this.rescheduleReason().trim() ? { reason: this.rescheduleReason().trim() } : {}),
      });
      this.showReschedule.set(false);
      const done = rescheduleSuccessMessage(result);
      this.successMessage.set(b.athleteId ? `${done} O atleta foi avisado.` : done);
    } catch (err) {
      this.rescheduleError.set(err instanceof Error ? err.message : 'Não foi possível remarcar a reserva.');
    } finally {
      this.rescheduling.set(false);
    }
  }

  protected async restore(): Promise<void> {
    const b = this.booking();
    const arenaId = this.arenaContext.arenaId();
    if (!b || !arenaId || this.readOnly()) return;
    this.errorMessage.set(null);
    try {
      await restoreBookingByManager(arenaFirestore(), b.id, arenaId);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível desfazer o cancelamento.');
    }
  }
}
