import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { AthleteSearchResult } from '../clubinho/clubs-repository';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { ToggleComponent } from '../ui/toggle.component';
import { AulaAthletePickerComponent } from './aula-modals.component';
import { AulasPageComponent, TeacherAvatarComponent } from './aulas-ui';
import {
  DEFAULT_RULES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PLAN_GROUP_LABEL,
  brl,
  formatPhoneBR,
  planDetail,
  planPriceUnit,
  slotsLabel,
  whatsappChargeLink,
  type Charge,
  type ClassPlan,
  type ClassRules,
  type PaymentMethod,
  type PlanKind,
} from './billing.model';
import {
  addWaitlist,
  createEnrollment,
  fetchPlans,
  fetchRules,
  fetchWaitlistEntry,
  previewEnrollment,
  watchStudentCharges,
  type EnrollmentInput,
  type EnrollmentPreview,
} from './billing-repository';
import {
  CLASS_LEVEL_LABEL,
  WEEKDAY_SHORT,
  studentAttendsWeekday,
  type ArenaClass,
  type ClassStudent,
} from './class.model';
import { fetchActiveClassStudents, fetchClassStudent, fetchClasses, getClassAthleteContact } from './classes-repository';

export interface SlotRow {
  key: string;
  classId: string;
  className: string;
  detail: string;
  weekday: number;
  startTime: string;
  teacherName: string;
  teacherColor: string;
  spotsLeft: number;
  /** O aluno já tem matrícula nessa turma (o servidor recusaria). */
  enrolled: boolean;
}

/**
 * Linhas (turma × dia da semana) para escolher os horários fixos. A vaga é por dia: quem faz
 * só terça não ocupa a quinta. O próprio aluno não conta — rematrícula não se bloqueia.
 */
export function buildSlotRows(
  classes: readonly ArenaClass[],
  rosters: ReadonlyMap<string, readonly ClassStudent[]>,
  studentKey: string | null,
  firstClassId: string | null = null,
): SlotRow[] {
  const rows: SlotRow[] = [];
  for (const cls of classes) {
    if (cls.status !== 'active' || cls.weekdays.length === 0) continue;
    const roster = (rosters.get(cls.id) ?? []).filter((s) => s.status === 'active');
    const enrolled = studentKey != null && roster.some((s) => s.id === studentKey && s.enrollmentId != null);
    for (const weekday of cls.weekdays) {
      const taken = roster.filter((s) => s.id !== studentKey && studentAttendsWeekday(s, weekday)).length;
      rows.push({
        key: `${cls.id}:${weekday}`,
        classId: cls.id,
        className: cls.name,
        detail: `${CLASS_LEVEL_LABEL[cls.level]} · ${cls.courtName}`,
        weekday,
        startTime: cls.startTime,
        teacherName: cls.teacherName,
        teacherColor: cls.teacherColor,
        spotsLeft: Math.max(0, cls.capacity - taken),
        enrolled,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      Number(b.classId === firstClassId) - Number(a.classId === firstClassId) ||
      a.weekday - b.weekday ||
      a.startTime.localeCompare(b.startTime) ||
      a.className.localeCompare(b.className, 'pt-BR'),
  );
}

/** Por que ainda não dá para seguir dos horários (null = pode). */
export function slotSelectionError(plan: Pick<ClassPlan, 'kind' | 'classesPerWeek'> | null, count: number): string | null {
  if (!plan) return 'Escolha um plano.';
  if (plan.kind === 'monthly') {
    const need = plan.classesPerWeek ?? 1;
    return count === need ? null : `Escolha ${need} horário${need > 1 ? 's' : ''} (${count} de ${need}).`;
  }
  return count >= 1 ? null : 'Escolha ao menos 1 horário.';
}

type Step = 1 | 2 | 3 | 4;
const STEPS = ['Aluno', 'Plano', 'Horários', 'Pagamento'] as const;
const PLAN_GROUPS: readonly PlanKind[] = ['monthly', 'package'];
const METHOD_HINT: Record<PaymentMethod, string> = {
  pix: 'Chave PIX da arena',
  cash: 'No balcão',
  card_machine: 'Maquininha da arena',
  transfer: 'TED ou depósito',
};

interface Prefill {
  athleteId: string | null;
  studentId: string | null;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  source: 'student' | 'waitlist';
}

interface Done {
  enrollmentId: string;
  studentId: string;
  name: string;
  phone: string | null;
  preview: EnrollmentPreview | null;
  /** Grupo da 1ª fatura online (null = cobrança manual). */
  asaasGroupId: string | null;
}

/** CPF (11) ou CNPJ (14) só com dígitos — a validação completa é do servidor. */
export function cpfDigitsOk(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  return d.length === 11 || d.length === 14;
}

/** 09–12 · Nova matrícula: aluno → plano → horários fixos → pagamento (cobrança manual). */
@Component({
  selector: 'ar-panel-aula-enrollment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, IconComponent, ToggleComponent, AulaAthletePickerComponent, TeacherAvatarComponent, AvatarComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Nova matrícula" [subtitle]="done() ? 'Matrícula confirmada' : 'Passo ' + step() + ' de 4 · ' + steps[step() - 1]">
      <button page-actions type="button" class="ar-mini-btn" (click)="leave()">{{ done() ? 'Fechar' : 'Cancelar' }}</button>

      @if (readOnly()) {
        <p class="state-text">Seu acesso à agenda é só de leitura — peça a um gestor para matricular.</p>
      } @else if (done(); as d) {
        <ar-panel-card>
          <div class="done-box">
            <span class="done-ic"><ar-icon name="check" [size]="26" /></span>
            <div class="done-title">Matrícula de {{ d.name }} confirmada</div>
            <p class="hint center">
              As vagas já estão reservadas na turma.
              @if (d.preview && d.preview.totalReais > 0) {
                @if (d.asaasGroupId) {
                  Cobrança online de <strong>{{ brl(d.preview.totalReais) }}</strong>:
                  @if (doneInvoiceUrl()) {
                    o link está pronto — o aluno paga com PIX ou cartão e a baixa é automática.
                  } @else {
                    gerando o link de pagamento…
                  }
                } @else {
                  Cobrança em aberto: <strong>{{ brl(d.preview.totalReais) }}</strong> — registre o pagamento no perfil do aluno quando receber.
                }
              } @else {
                Nada a cobrar agora — a próxima mensalidade é gerada 10 dias antes do vencimento.
              }
            </p>
            <div class="done-actions">
              @if (doneInvoiceUrl(); as url) {
                <button type="button" class="ar-mini-btn" (click)="copyLink(url)">{{ copied() ? 'Link copiado ✓' : 'Copiar link' }}</button>
              }
              @if (doneWhatsapp(); as link) {
                <a class="ar-mini-btn" [href]="link" target="_blank" rel="noopener">Cobrar no WhatsApp</a>
              }
              <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="go(['/painel/aulas/alunos', d.enrollmentId])">Ver aluno</button>
              <button type="button" class="ar-mini-btn" (click)="restart()">Nova matrícula</button>
            </div>
          </div>
        </ar-panel-card>
      } @else {
        <div class="wizard-steps">
          @for (s of steps; track s; let i = $index) {
            <div class="st" [class.on]="i + 1 === step()" [class.done]="i + 1 < step()">
              <span class="st-n">{{ i + 1 < step() ? '✓' : i + 1 }}</span>
              <span class="st-l">{{ s }}</span>
            </div>
            @if (i < 3) {
              <div class="st-line" [class.done]="i + 1 < step()"></div>
            }
          }
        </div>

        @if (error(); as err) {
          <div class="error-banner">{{ err }}</div>
        }

        <div class="layout">
          <div class="main">
            @switch (step()) {
              @case (1) {
                <ar-panel-card title="Quem vai se matricular?" kicker="Atleta NexaGO ou contato da arena">
                  @if (prefill(); as p) {
                    <div class="pick on static">
                      <ar-avatar [name]="p.name" [photoUrl]="p.photoUrl" [size]="40" zoomable personRole="Aluno" />
                      <div class="grow">
                        <div class="p-title">{{ p.name }}</div>
                        <div class="sub">{{ p.athleteId ? 'Atleta NexaGO' : 'Contato da arena · sem conta' }} · {{ p.source === 'waitlist' ? 'da lista de espera' : 'já é aluno da turma' }}</div>
                      </div>
                      <button type="button" class="ar-ghost-btn" (click)="clearPrefill()">Trocar</button>
                    </div>
                  } @else {
                    <div class="chip-row">
                      <button type="button" class="ar-chip" [class.active]="mode() === 'athlete'" (click)="setMode('athlete')">Atleta NexaGO</button>
                      <button type="button" class="ar-chip" [class.active]="mode() === 'guest'" (click)="setMode('guest')">Sem conta</button>
                    </div>
                    @if (mode() === 'athlete') {
                      <div class="field-label spaced">Buscar atleta</div>
                      <ar-aula-athlete-picker placeholder="Nome do atleta" emptyHint="Nenhum atleta encontrado. Cadastre como “Sem conta” ou peça para criar a conta no app." (selected)="pickAthlete($event)" />
                    } @else {
                      <div class="field-label spaced">Nome</div>
                      <input class="input-box" type="text" maxlength="80" [value]="guestName()" (input)="guestName.set($any($event.target).value)" />
                    }
                  }
                  <div class="field-label spaced">Telefone (WhatsApp)</div>
                  <input class="input-box" type="tel" maxlength="30" placeholder="(11) 99999-9999" [value]="phone()" (input)="phone.set($any($event.target).value)" />
                  @if (phoneFromAccount()) {
                    <p class="hint">Telefone do cadastro do atleta no NexaGO — confira antes de cobrar.</p>
                  } @else {
                    <p class="hint">O telefone é usado no botão "Cobrar" — a mensagem sai pronta no WhatsApp.</p>
                  }
                </ar-panel-card>
              }
              @case (2) {
                <ar-panel-card title="Escolha o plano" [kicker]="studentName()">
                  @if (!loaded()) {
                    <p class="hint first">Carregando planos…</p>
                  } @else if (plans().length === 0) {
                    <p class="hint first">Nenhum plano de mensalidade ou pacote ativo.</p>
                    <button type="button" class="ar-mini-btn spaced-btn" (click)="go(['/painel/aulas/planos'])">Criar plano</button>
                  } @else {
                    @for (g of planGroups; track g) {
                      @if (plansOf(g).length > 0) {
                        <div class="group">
                          <div class="field-label">{{ groupLabel[g] }}</div>
                          <div class="plan-grid">
                            @for (p of plansOf(g); track p.id) {
                              <button type="button" class="pick" [class.on]="planId() === p.id" (click)="planId.set(p.id)">
                                <div class="p-title">{{ p.name }}</div>
                                <div class="p-price">{{ brl(p.priceReais) }}<span> {{ unit(p.kind) }}</span></div>
                                <div class="sub">{{ detail(p) }}</div>
                              </button>
                            }
                          </div>
                        </div>
                      }
                    }
                    <p class="hint">Avulsa e experimental não são matrícula — use "Agendar aula" ou o encaixe na chamada.</p>
                  }
                </ar-panel-card>
              }
              @case (3) {
                <ar-panel-card [title]="slotsTitle()" [kicker]="plan()?.name ?? ''">
                  @if (slotRows().length === 0) {
                    <p class="hint first">Nenhuma turma recorrente ativa. Crie uma turma antes de matricular.</p>
                  } @else {
                    <div class="slot-head">
                      <span></span><span>Turma</span><span>Dia / hora</span><span>Professor</span><span>Vagas</span><span></span>
                    </div>
                    @for (r of slotRows(); track r.key) {
                      <div class="slot-row" [class.off]="slotBlocked(r)">
                        <button type="button" class="check" [class.on]="selected().has(r.key)" [disabled]="slotBlocked(r) || (!selected().has(r.key) && capReached())" [attr.aria-label]="'Escolher ' + r.className + ' ' + day(r.weekday)" (click)="toggleSlot(r)">
                          @if (selected().has(r.key)) { ✓ }
                        </button>
                        <div class="min0">
                          <div class="p-title">{{ r.className }}</div>
                          <div class="sub">{{ r.detail }}</div>
                        </div>
                        <span class="mono">{{ day(r.weekday) }} {{ r.startTime }}</span>
                        <span class="teacher"><ar-teacher-avatar [name]="r.teacherName" [color]="r.teacherColor" [size]="22" />{{ firstName(r.teacherName) }}</span>
                        <span class="mono" [class.full]="r.spotsLeft === 0">{{ r.enrolled ? 'Matriculado' : r.spotsLeft === 0 ? 'Lotada' : r.spotsLeft + ' livre' }}</span>
                        <span>
                          @if (r.spotsLeft === 0 && !r.enrolled) {
                            @if (waitlisted().has(r.classId)) {
                              <span class="sub">Na lista ✓</span>
                            } @else {
                              <button type="button" class="ar-ghost-btn small" [disabled]="busy()" (click)="joinWaitlist(r)">Lista de espera</button>
                            }
                          }
                        </span>
                      </div>
                    }
                    @if (slotError(); as msg) {
                      <p class="hint">{{ msg }}</p>
                    } @else {
                      <p class="hint">As aulas que faltam no mês corrente entram proporcionalmente na 1ª cobrança.</p>
                    }
                  }
                </ar-panel-card>
              }
              @case (4) {
                <ar-panel-card title="Pagamento" [kicker]="billingMode() === 'asaas' ? 'Online pelo Asaas' : 'Recebido direto pela arena'">
                  @if (rules().onlineBillingEnabled) {
                    <div class="mode-grid">
                      <button type="button" class="pick" [class.on]="billingMode() === 'asaas'" (click)="setBillingMode('asaas')">
                        <div class="p-title">Online</div>
                        <div class="sub">PIX ou cartão pelo link · baixa automática</div>
                      </button>
                      <button type="button" class="pick" [class.on]="billingMode() === 'manual'" (click)="setBillingMode('manual')">
                        <div class="p-title">Manual</div>
                        <div class="sub">Você registra ao receber</div>
                      </button>
                    </div>
                  }
                  @if (billingMode() === 'asaas') {
                    <div class="field-label spaced">CPF de quem paga {{ studentHasAccount() ? '(opcional se já estiver no cadastro NexaGO)' : '' }}</div>
                    <input class="input-box" type="text" inputmode="numeric" maxlength="18" placeholder="000.000.000-00" [value]="cpf()" (input)="cpf.set($any($event.target).value)" />
                    <p class="hint">O CPF fica guardado só no servidor, para emitir a fatura — não aparece na tela nem no cadastro do atleta.</p>
                  } @else {
                    <div class="method-grid" [class.spaced-row]="rules().onlineBillingEnabled">
                      @for (m of methods; track m) {
                        <button type="button" class="pick" [class.on]="method() === m" (click)="method.set(m)">
                          <div class="p-title">{{ methodLabel[m] }}</div>
                          <div class="sub">{{ methodHint[m] }}</div>
                        </button>
                      }
                    </div>
                  }
                  <div class="row-2 spaced-row">
                    @if (plan()?.kind === 'monthly') {
                      <div>
                        <div class="field-label">Dia de vencimento</div>
                        <input class="input-box" type="number" min="1" max="28" [value]="dueDay()" (input)="dueDay.set(+$any($event.target).value)" />
                      </div>
                    }
                    <div>
                      <div class="field-label">1ª cobrança</div>
                      <div class="input-box static">Hoje · {{ plan()?.kind === 'monthly' ? 'proporcional' : 'pacote' }}</div>
                    </div>
                  </div>
                  @if (rules().enrollmentFeeReais > 0) {
                    <div class="toggle-row">
                      <div class="grow">
                        <div class="p-title">Isentar taxa de matrícula</div>
                        <div class="sub">Taxa da arena: {{ brl(rules().enrollmentFeeReais) }}</div>
                      </div>
                      <ar-toggle label="Isentar taxa de matrícula" [checked]="waiveFee()" (changed)="setWaive($event)" />
                    </div>
                  }
                  @if (billingMode() === 'asaas') {
                    <p class="hint">Cada mensalidade vira uma fatura (PIX ou cartão). O link vai no "Cobrar" e por push para quem tem conta; o valor cai no caixa da arena com a taxa do pagamento online.</p>
                  } @else {
                    <p class="hint">A plataforma gera as mensalidades e você registra o pagamento ao receber.</p>
                  }
                </ar-panel-card>
              }
            }
          </div>

          <div class="side">
            <ar-panel-card title="Resumo da matrícula">
              <div class="sum-row"><div class="kick">Aluno</div><div class="sum-v" [class.dim]="!studentName()">{{ studentName() || '—' }}</div></div>
              <div class="sum-row"><div class="kick">Plano</div><div class="sum-v" [class.dim]="!plan()">{{ plan() ? plan()!.name + ' · ' + brl(plan()!.priceReais) : '—' }}</div></div>
              <div class="sum-row"><div class="kick">Horários</div><div class="sum-v" [class.dim]="selectedRows().length === 0">{{ slotsSummary() || '—' }}</div></div>
              @if (step() === 4) {
                @if (previewing()) {
                  <p class="hint">Calculando…</p>
                } @else if (preview(); as pv) {
                  @for (c of pv.charges; track $index) {
                    <div class="line"><span>{{ c.description }}</span><span class="mono">{{ brl(c.amountReais) }}</span></div>
                  }
                  @if (rules().enrollmentFeeReais > 0 && waiveFee()) {
                    <div class="line"><span>Taxa de matrícula</span><span class="mono green">Isenta</span></div>
                  }
                  <div class="total"><span>Cobrar hoje</span><strong>{{ brl(pv.totalReais) }}</strong></div>
                }
              }
            </ar-panel-card>
            <div class="nav">
              @if (step() > 1) {
                <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="back()">Voltar</button>
              }
              <span class="grow"></span>
              <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canContinue() || busy()" (click)="next()">
                {{ step() === 4 ? (busy() ? 'Matriculando…' : 'Confirmar matrícula') : 'Continuar' }}
              </button>
            </div>
          </div>
        </div>
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .wizard-steps { display: flex; align-items: center; gap: 10px; flex: none; }
    .st { display: flex; align-items: center; gap: 9px; }
    .st-n {
      width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; color: var(--nx-text-dim);
    }
    .st.on .st-n { background: var(--nx-orange-500); border-color: var(--nx-orange-500); color: #0a0a0a; }
    .st.done .st-n { background: var(--nx-win); border-color: var(--nx-win); color: #0a0a0a; }
    .st-l { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text-dim); }
    .st.on .st-l { color: var(--nx-text); }
    .st-line { flex: 1; height: 1px; background: var(--nx-line-strong); }
    .st-line.done { background: var(--nx-win); }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    .main, .side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .grow { flex: 1; min-width: 0; }
    .min0 { min-width: 0; }
    .first { margin-top: 0; }
    .pick {
      display: block; width: 100%; text-align: left; padding: 14px; cursor: pointer; color: var(--nx-text);
      border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line);
    }
    .pick.on { background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.5); }
    .pick.static { display: flex; align-items: center; gap: 12px; cursor: default; padding: 12px; }
    .p-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .p-price { font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; color: var(--nx-text); margin-top: 8px; }
    .pick.on .p-price { color: var(--nx-orange-500); }
    .p-price span, .sub { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 500; color: var(--nx-text-dim); }
    .sub { margin-top: 4px; }
    .group { margin-bottom: 14px; }
    .plan-grid, .method-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .method-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .spaced-btn { margin-top: 12px; }
    .spaced-row { margin-top: 16px; }
    .static { display: flex; align-items: center; color: var(--nx-text-dim); }
    .slot-head, .slot-row { display: grid; grid-template-columns: 30px minmax(0, 1.3fr) 90px minmax(0, 1fr) 90px 120px; gap: 12px; align-items: center; }
    .slot-head { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); padding-bottom: 8px; border-bottom: 1px solid var(--nx-line); }
    .slot-row { padding: 11px 0; border-bottom: 1px solid var(--nx-line); }
    .slot-row.off { opacity: 0.55; }
    .check {
      width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; cursor: pointer; padding: 0;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); color: #0a0a0a; font-weight: 800; font-size: 12px;
    }
    .check.on { background: var(--nx-orange-500); border-color: var(--nx-orange-500); }
    .check:disabled { cursor: not-allowed; }
    .mono { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 700; color: var(--nx-text); }
    .mono.full { color: var(--nx-live); }
    .green { color: var(--nx-win); }
    .teacher { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--nx-text); min-width: 0; }
    .small { height: 28px; font-size: 11.5px; }
    .toggle-row { display: flex; align-items: center; gap: 14px; padding: 14px 0 2px; }
    .sum-row { padding: 8px 0; border-bottom: 1px solid var(--nx-line); }
    .kick { font-family: var(--nx-font-mono); font-size: 8.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .sum-v { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); margin-top: 3px; }
    .sum-v.dim { color: var(--nx-text-dim); }
    .line { display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; font-size: 12.5px; color: var(--nx-text-mute); }
    .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--nx-line-strong); }
    .total span { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .total strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; color: var(--nx-orange-500); }
    .nav { display: flex; gap: 8px; }
    .done-box { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 12px; }
    .done-ic { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: rgba(43, 209, 126, 0.12); color: var(--nx-win); }
    .done-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 18px; color: var(--nx-text); margin-top: 14px; }
    .center { max-width: 460px; text-align: center; }
    .done-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 18px; }
    .done-actions a { text-decoration: none; display: inline-flex; align-items: center; }
    @media (max-width: 1100px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .plan-grid, .method-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      .st-l { display: none; }
      .slot-head { display: none; }
      .slot-row { grid-template-columns: 30px minmax(0, 1fr) auto; }
      .slot-row .teacher, .slot-row > span:last-child:empty { display: none; }
    }
  `,
})
export class PanelAulaEnrollmentComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly steps = STEPS;
  protected readonly planGroups = PLAN_GROUPS;
  protected readonly groupLabel = PLAN_GROUP_LABEL;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabel = PAYMENT_METHOD_LABEL;
  protected readonly methodHint = METHOD_HINT;
  protected readonly brl = brl;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));

  private readonly params = this.route.snapshot.queryParamMap;
  private readonly classIdParam = this.params.get('classId');

  protected readonly step = signal<Step>(1);
  protected readonly mode = signal<'athlete' | 'guest'>('athlete');
  protected readonly picked = signal<AthleteSearchResult | null>(null);
  protected readonly guestName = signal('');
  protected readonly phone = signal('');
  /** Telefone que veio do cadastro do atleta (vazio = o campo é do gestor). */
  private readonly accountPhone = signal('');
  protected readonly phoneFromAccount = computed(() => this.accountPhone() !== '' && this.phone() === this.accountPhone());
  private contactSeq = 0;
  protected readonly prefill = signal<Prefill | null>(null);

  protected readonly plans = signal<ClassPlan[]>([]);
  protected readonly rules = signal<ClassRules>({ ...DEFAULT_RULES });
  private readonly classes = signal<ArenaClass[]>([]);
  private readonly rosters = signal<ReadonlyMap<string, ClassStudent[]>>(new Map());
  protected readonly loaded = signal(false);

  protected readonly planId = signal<string | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly method = signal<PaymentMethod>('pix');
  protected readonly billingMode = signal<'manual' | 'asaas'>('manual');
  protected readonly cpf = signal('');
  protected readonly copied = signal(false);
  private readonly doneCharges = signal<Charge[]>([]);
  private unsubDone: (() => void) | null = null;
  protected readonly dueDay = signal(DEFAULT_RULES.defaultDueDay);
  protected readonly waiveFee = signal(false);
  protected readonly preview = signal<EnrollmentPreview | null>(null);
  protected readonly previewing = signal(false);
  protected readonly waitlisted = signal<ReadonlySet<string>>(new Set());

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<Done | null>(null);

  protected readonly plan = computed(() => this.plans().find((p) => p.id === this.planId()) ?? null);
  /** Id do aluno nas turmas: o uid do atleta ou o id do contato já cadastrado. */
  private readonly studentKey = computed(() => {
    const p = this.prefill();
    if (p) return p.athleteId ?? p.studentId;
    return this.mode() === 'athlete' ? this.picked()?.id ?? null : null;
  });
  protected readonly studentName = computed(() => {
    const p = this.prefill();
    if (p) return p.name;
    return this.mode() === 'athlete' ? this.picked()?.name ?? '' : this.guestName().trim();
  });
  protected readonly slotRows = computed(() => buildSlotRows(this.classes(), this.rosters(), this.studentKey(), this.classIdParam));
  protected readonly selectedRows = computed(() => this.slotRows().filter((r) => this.selected().has(r.key)));
  protected readonly slotsSummary = computed(() => {
    const rows = this.selectedRows();
    if (rows.length === 0) return '';
    return `${slotsLabel(rows)} · ${[...new Set(rows.map((r) => r.className))].join(', ')}`;
  });
  protected readonly slotError = computed(() => slotSelectionError(this.plan(), this.selectedRows().length));
  protected readonly capReached = computed(() => {
    const p = this.plan();
    return p?.kind === 'monthly' && this.selectedRows().length >= (p.classesPerWeek ?? 1);
  });
  protected readonly slotsTitle = computed(() => {
    const p = this.plan();
    if (p?.kind === 'monthly') {
      const n = p.classesPerWeek ?? 1;
      return `Escolha ${n} horário${n > 1 ? 's' : ''} fixo${n > 1 ? 's' : ''}`;
    }
    return 'Escolha os horários fixos';
  });
  protected readonly canContinue = computed(() => {
    switch (this.step()) {
      case 1:
        return this.studentName().length >= 2 && (this.prefill() != null || this.mode() === 'guest' || this.picked() != null);
      case 2:
        return this.plan() != null;
      case 3:
        return this.slotError() == null;
      default: {
        const d = this.dueDay();
        const cpfOk = this.billingMode() !== 'asaas' || cpfDigitsOk(this.cpf()) ||
          (this.cpf().trim() === '' && this.studentHasAccount());
        return this.preview() != null && !this.previewing() && Number.isInteger(d) && d >= 1 && d <= 28 && cpfOk;
      }
    }
  });
  /** Link da 1ª fatura online, quando o worker termina de gerar (a mensalidade é escutada ao vivo). */
  protected readonly doneInvoiceUrl = computed(() => {
    const groupId = this.done()?.asaasGroupId;
    if (!groupId) return null;
    const c = this.doneCharges().find((x) => x.asaas?.groupId === groupId && x.asaas.state === 'open');
    return c?.asaas?.invoiceUrl ?? null;
  });
  protected readonly doneWhatsapp = computed(() => {
    const d = this.done();
    const pv = d?.preview;
    if (!d || !pv || pv.charges.length === 0 || pv.totalReais <= 0) return null;
    // Online: só depois que o link existe — a mensagem leva o link.
    if (d.asaasGroupId && !this.doneInvoiceUrl()) return null;
    const charge = { description: pv.charges.map((c) => c.description).join(' + '), amountReais: pv.totalReais, dueDate: pv.charges[0]!.dueDate };
    return whatsappChargeLink(d.phone, d.name, charge, this.arenaContext.arenaName() ?? 'arena', this.doneInvoiceUrl());
  });
  /** O aluno tem conta NexaGO (o CPF pode vir do cadastro dele). */
  protected readonly studentHasAccount = computed(() => {
    const p = this.prefill();
    return p ? p.athleteId != null : this.mode() === 'athlete' && this.picked() != null;
  });

  private previewSeq = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unsubDone?.());
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId);
    });
    void this.loadPrefill();
  }

  private async load(arenaId: string): Promise<void> {
    this.loaded.set(false);
    try {
      const db = arenaFirestore();
      const [plans, rules, classes] = await Promise.all([fetchPlans(db, arenaId), fetchRules(db, arenaId), fetchClasses(db, arenaId)]);
      this.plans.set(plans.filter((p) => p.status === 'active' && (p.kind === 'monthly' || p.kind === 'package')));
      this.rules.set(rules);
      // A arena ligou a cobrança online para usar: vira o padrão da matrícula.
      this.billingMode.set(rules.onlineBillingEnabled ? 'asaas' : 'manual');
      this.dueDay.set(rules.defaultDueDay);
      const recurring = classes.filter((c) => c.status === 'active' && c.weekdays.length > 0);
      this.classes.set(recurring);
      const rosters = await Promise.all(recurring.map((c) => fetchActiveClassStudents(db, arenaId, c.id)));
      this.rosters.set(new Map(recurring.map((c, i) => [c.id, rosters[i]!])));
    } catch {
      this.error.set('Não foi possível carregar planos e turmas.');
    } finally {
      this.loaded.set(true);
    }
  }

  /** `?classId&studentId` (aluno da turma sem plano) ou `?classId&waitlist` (lista de espera). */
  private async loadPrefill(): Promise<void> {
    const classId = this.classIdParam;
    const studentId = this.params.get('studentId');
    const entryId = this.params.get('waitlist');
    if (!classId || (!studentId && !entryId)) return;
    try {
      const db = arenaFirestore();
      if (entryId) {
        const w = await fetchWaitlistEntry(db, classId, entryId);
        if (w && w.status === 'waiting') {
          this.prefill.set({ athleteId: w.athleteId, studentId: null, name: w.name, phone: w.phone, photoUrl: null, source: 'waitlist' });
          this.phone.set(w.phone ?? '');
          void this.fillAccountPhone(w.athleteId);
        }
      } else if (studentId) {
        const st = await fetchClassStudent(db, classId, studentId);
        if (st && st.status !== 'removed') {
          this.prefill.set({
            athleteId: st.athleteId, studentId: st.athleteId ? null : st.id, name: st.name, phone: st.phone, photoUrl: st.photoUrl, source: 'student',
          });
          this.phone.set(st.phone ?? '');
          void this.fillAccountPhone(st.athleteId);
        }
      }
    } catch {
      // Sem pré-preenchimento: a matrícula segue pela busca normal.
    }
  }

  protected plansOf(kind: PlanKind): ClassPlan[] {
    return this.plans().filter((p) => p.kind === kind);
  }

  protected unit(kind: PlanKind): string {
    return planPriceUnit(kind);
  }

  protected detail(p: ClassPlan): string {
    return planDetail(p);
  }

  protected day(weekday: number): string {
    return WEEKDAY_SHORT[weekday] ?? '?';
  }

  protected firstName(name: string): string {
    return name.split(' ')[0] ?? name;
  }

  protected slotBlocked(r: SlotRow): boolean {
    return r.enrolled || (r.spotsLeft === 0 && !this.selected().has(r.key));
  }

  protected clearPrefill(): void {
    this.prefill.set(null);
    this.resetPhone();
  }

  protected setMode(mode: 'athlete' | 'guest'): void {
    this.mode.set(mode);
    // O número do cadastro é do atleta escolhido — não pode virar o do contato sem conta.
    if (mode === 'guest') void this.fillAccountPhone(null);
    else void this.fillAccountPhone(this.picked()?.id ?? null);
  }

  protected pickAthlete(athlete: AthleteSearchResult | null): void {
    this.picked.set(athlete);
    void this.fillAccountPhone(athlete?.id ?? null);
  }

  /** Preenche o telefone com o do cadastro do atleta. O que veio do cadastro de outro atleta
   *  sai; o que o gestor digitou fica. Sem resposta, o campo fica para digitar — e a matrícula
   *  com telefone em branco usa o do cadastro no servidor de qualquer jeito. */
  private async fillAccountPhone(athleteId: string | null): Promise<void> {
    const seq = ++this.contactSeq;
    if (this.phoneFromAccount()) this.phone.set('');
    this.accountPhone.set('');
    const arenaId = this.arenaContext.arenaId();
    if (!athleteId || !arenaId || this.phone().trim()) return;
    try {
      const { phone } = await getClassAthleteContact(arenaFunctions(), arenaId, athleteId);
      const formatted = formatPhoneBR(phone);
      if (seq !== this.contactSeq || !formatted || this.phone().trim()) return;
      this.phone.set(formatted);
      this.accountPhone.set(formatted);
    } catch {
      // Segue sem pré-preenchimento.
    }
  }

  private resetPhone(): void {
    this.contactSeq++;
    this.phone.set('');
    this.accountPhone.set('');
  }

  protected toggleSlot(r: SlotRow): void {
    const next = new Set(this.selected());
    if (next.has(r.key)) next.delete(r.key);
    else next.add(r.key);
    this.selected.set(next);
  }

  protected setWaive(value: boolean): void {
    this.waiveFee.set(value);
    void this.refreshPreview();
  }

  protected back(): void {
    this.error.set(null);
    if (this.step() > 1) this.step.set((this.step() - 1) as Step);
  }

  protected next(): void {
    if (!this.canContinue()) return;
    this.error.set(null);
    const s = this.step();
    if (s === 4) {
      void this.confirm();
      return;
    }
    if (s === 2) {
      // Plano trocado: horários que já não cabem saem da seleção.
      const keep = new Set(this.slotRows().filter((r) => this.selected().has(r.key) && !r.enrolled).map((r) => r.key));
      this.selected.set(keep);
    }
    this.step.set((s + 1) as Step);
    if (s === 3) void this.refreshPreview();
  }

  private input(): EnrollmentInput | null {
    const arenaId = this.arenaContext.arenaId();
    const plan = this.plan();
    if (!arenaId || !plan) return null;
    const p = this.prefill();
    const phone = this.phone().trim() || undefined;
    const student: Partial<EnrollmentInput> = p
      ? p.athleteId
        ? { athleteId: p.athleteId, phone }
        : { studentId: p.studentId ?? undefined, name: p.name, phone }
      : this.mode() === 'athlete'
        ? { athleteId: this.picked()?.id, phone }
        : { name: this.guestName().trim(), phone };
    return {
      arenaId,
      planId: plan.id,
      slots: this.selectedRows().map((r) => ({ classId: r.classId, weekday: r.weekday })),
      dueDay: plan.kind === 'monthly' ? this.dueDay() : this.rules().defaultDueDay,
      paymentMethod: this.method(),
      waiveFee: this.waiveFee(),
      billingMode: this.billingMode(),
      ...(this.billingMode() === 'asaas' && this.cpf().trim() ? { cpfCnpj: this.cpf().replace(/\D/g, '') } : {}),
      ...student,
      ...(p?.source === 'waitlist' && this.classIdParam
        ? { waitlistClassId: this.classIdParam, waitlistEntryId: this.params.get('waitlist') ?? undefined }
        : {}),
    };
  }

  private async refreshPreview(): Promise<void> {
    const input = this.input();
    if (!input) return;
    const seq = ++this.previewSeq;
    this.previewing.set(true);
    try {
      const pv = await previewEnrollment(arenaFunctions(), input);
      if (seq === this.previewSeq) this.preview.set(pv);
    } catch (err) {
      if (seq === this.previewSeq) {
        this.preview.set(null);
        this.error.set(err instanceof Error ? err.message : 'Não foi possível calcular a cobrança.');
      }
    } finally {
      if (seq === this.previewSeq) this.previewing.set(false);
    }
  }

  private async confirm(): Promise<void> {
    const input = this.input();
    if (!input) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await createEnrollment(arenaFunctions(), input);
      const asaasGroupId = result.asaasGroupId ?? null;
      this.done.set({
        enrollmentId: result.enrollmentId, studentId: result.studentId, name: this.studentName(),
        phone: input.phone ?? null, preview: this.preview(), asaasGroupId,
      });
      if (asaasGroupId) this.watchDoneCharges(input.arenaId, result.studentId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível concluir a matrícula.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async joinWaitlist(r: SlotRow): Promise<void> {
    const p = this.prefill();
    const athleteId = p ? p.athleteId : this.mode() === 'athlete' ? this.picked()?.id ?? null : null;
    this.busy.set(true);
    this.error.set(null);
    try {
      await addWaitlist(arenaFunctions(), {
        classId: r.classId,
        ...(athleteId ? { athleteId } : { name: this.studentName() }),
        phone: this.phone().trim() || undefined,
        note: `${this.day(r.weekday)} ${r.startTime}`,
      });
      this.waitlisted.set(new Set([...this.waitlisted(), r.classId]));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível entrar na lista de espera.');
    } finally {
      this.busy.set(false);
    }
  }

  private watchDoneCharges(arenaId: string, studentId: string): void {
    this.unsubDone?.();
    this.unsubDone = watchStudentCharges(arenaFirestore(), arenaId, studentId, (list) => this.doneCharges.set(list));
  }

  protected setBillingMode(mode: 'manual' | 'asaas'): void {
    this.billingMode.set(mode);
    void this.refreshPreview();
  }

  protected copyLink(url: string): void {
    void navigator.clipboard?.writeText(url).then(() => this.copied.set(true), () => undefined);
  }

  protected restart(): void {
    this.unsubDone?.();
    this.unsubDone = null;
    this.doneCharges.set([]);
    this.copied.set(false);
    this.cpf.set('');
    this.done.set(null);
    this.prefill.set(null);
    this.picked.set(null);
    this.guestName.set('');
    this.resetPhone();
    this.planId.set(null);
    this.selected.set(new Set());
    this.waiveFee.set(false);
    this.preview.set(null);
    this.waitlisted.set(new Set());
    this.method.set('pix');
    this.dueDay.set(this.rules().defaultDueDay);
    this.step.set(1);
    const arenaId = this.arenaContext.arenaId();
    if (arenaId) void this.load(arenaId);
    void this.router.navigate(['/painel/aulas/matricula']);
  }

  protected leave(): void {
    void this.router.navigate(this.classIdParam ? ['/painel/aulas/turmas', this.classIdParam] : ['/painel/aulas/alunos']);
  }

  protected go(route: unknown[]): void {
    void this.router.navigate(route);
  }
}
