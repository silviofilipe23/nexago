import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import type { AthleteSearchResult } from '../clubinho/clubs-repository';
import { AvatarComponent } from '../ui/avatar.component';
import { ModalComponent } from '../ui/modal.component';
import {
  ACCOUNT_LINK_STATE_LABEL,
  PROFESSOR_INVITE_TTL_DAYS,
  PROFESSOR_STATUS_META,
  PROFESSOR_TYPE_META,
  SUSPENSION_REASONS,
  accountLinkState,
  dayMonthLabel,
  defaultProfessorPermissions,
  timeLabel,
  type ArenaProfessorLink,
  type ProfessorLinkType,
  type ProfessorPermissions,
} from './arena-professor.model';
import { ArenaProfessorsService } from './arena-professors.service';
import {
  ProfessorNoteComponent,
  ProfessorPermListComponent,
  ProfessorRadioCardComponent,
  ProfessorTypeTagComponent,
  type PermissionChange,
} from './professor-ui';

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const SHARED_STYLES = `
  .danger { background: var(--nx-live); border-color: var(--nx-live); color: #fff; box-shadow: none; }
  .danger:hover:not(:disabled) { background: #ff564c; }
  .danger-text { color: var(--nx-live); }
  .grow { flex: 1; }
  .modal-actions { align-items: center; flex-wrap: wrap; }
  ar-prof-note { margin-top: 16px; }
`;

/** A2 · Convidar professor — só conta NexaGO existente (busca no perfil público). O vínculo
 *  nasce `INVITED` e nada vale antes do aceite; a proposta de permissões segue o padrão do tipo. */
@Component({
  selector: 'ar-prof-invite-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, AvatarComponent, ProfessorRadioCardComponent, ProfessorPermListComponent, ProfessorNoteComponent],
  styleUrl: '../aulas/aulas-form.scss',
  template: `
    <ar-modal size="lg" (close)="dismiss()">
      <p class="modal-title">Convidar professor</p>
      <p class="modal-sub">O vínculo só fica ativo depois que o professor aceitar.</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }

      <div class="field-label spaced">1 · Professor</div>
      <input
        class="input-box"
        type="search"
        placeholder="Buscar conta NexaGO pelo nome ou apelido"
        aria-label="Buscar conta NexaGO pelo nome ou apelido"
        [value]="term()"
        (input)="onTerm($any($event.target).value)"
      />
      <div class="results">
        @if (searching()) {
          <p class="hint">Buscando…</p>
        }
        @for (row of rows(); track row.account.id) {
          <button
            type="button"
            class="result"
            [class.active]="picked()?.id === row.account.id"
            [disabled]="row.state !== 'available'"
            [attr.aria-pressed]="picked()?.id === row.account.id"
            (click)="picked.set(row.account)"
          >
            <ar-avatar [name]="row.account.name" [photoUrl]="row.account.photoUrl" />
            <span class="result-name">{{ row.account.name }}</span>
            @if (row.state !== 'available') {
              <span class="result-state">{{ stateLabel[row.state] }}</span>
            } @else if (picked()?.id === row.account.id) {
              <span class="check">✓</span>
            }
          </button>
        } @empty {
          @if (term().trim().length >= 2 && !searching()) {
            <p class="hint">Nenhuma conta encontrada com esse nome.</p>
          }
        }
      </div>
      <div class="no-account">
        <div class="na-text">
          <div class="na-title">Não tem conta na NexaGO?</div>
          <div class="na-sub">
            O professor cria a conta no app NexaGO e pede o vínculo pela página da arena — o pedido
            aparece aqui para você aprovar.
          </div>
        </div>
        <button type="button" class="ar-mini-btn" (click)="copyLink()">{{ copied() ? 'Link copiado' : 'Copiar link da página' }}</button>
      </div>

      <div class="field-label spaced">2 · Tipo de vínculo</div>
      <div class="types" role="radiogroup" aria-label="Tipo de vínculo">
        @for (t of types; track t) {
          <ar-prof-radio-card [type]="t" [on]="type() === t" (picked)="setType($event)" />
        }
      </div>

      <div class="field-label spaced">3 · Permissões propostas</div>
      <ar-prof-perm-list [permissions]="permissions()" [editable]="true" [dense]="true" [disabled]="busy()" (changed)="setPermission($event)" />

      <div class="field-label spaced">Mensagem (opcional)</div>
      <textarea
        class="input-box"
        maxlength="500"
        placeholder="Ex.: queremos você nas turmas de sábado de manhã"
        aria-label="Mensagem para o professor"
        [value]="message()"
        (input)="message.set($any($event.target).value)"
      ></textarea>

      <ar-prof-note tone="blue">O convite expira em {{ ttlDays }} dias. Nenhuma permissão é liberada antes do aceite.</ar-prof-note>

      <div class="modal-actions">
        <button type="button" class="ar-ghost-btn" [disabled]="busy()" (click)="dismiss()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !canSend()" (click)="send()">
          {{ busy() ? 'Enviando…' : 'Enviar convite' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: [
    SHARED_STYLES,
    `
    .results { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; max-height: 220px; overflow-y: auto; }
    .result {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px; text-align: left; cursor: pointer;
      border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text);
    }
    .result:disabled { cursor: default; opacity: 0.6; }
    .result.active { background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.45); }
    .result-name { flex: 1; min-width: 0; font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .result-state { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 600; color: #5B9BFF; text-align: right; }
    .check { color: var(--nx-orange-500); font-weight: 700; }
    .no-account {
      display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 10px 12px;
      border-radius: var(--nx-r-2); border: 1px dashed var(--nx-line-strong);
    }
    .na-text { flex: 1; min-width: 0; }
    .na-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .na-sub { font-size: 11.5px; color: var(--nx-text-dim); margin-top: 2px; line-height: 1.45; }
    .types { display: flex; gap: 10px; }
    @media (max-width: 560px) {
      .types, .no-account { flex-direction: column; align-items: stretch; }
    }
  `,
  ],
})
export class ProfessorInviteModalComponent {
  private readonly service = inject(ArenaProfessorsService);

  readonly arenaId = input.required<string>();
  /** Vínculos já carregados — cruzam com a busca para não convidar quem já tem vínculo aberto. */
  readonly links = input.required<readonly ArenaProfessorLink[]>();
  readonly pageUrl = input.required<string>();
  readonly closed = output<void>();
  readonly sent = output<string>();

  protected readonly types: readonly ProfessorLinkType[] = ['ARENA_STAFF', 'INDEPENDENT'];
  protected readonly stateLabel = ACCOUNT_LINK_STATE_LABEL;
  protected readonly ttlDays = PROFESSOR_INVITE_TTL_DAYS;

  protected readonly term = signal('');
  protected readonly results = signal<AthleteSearchResult[]>([]);
  protected readonly searching = signal(false);
  protected readonly picked = signal<AthleteSearchResult | null>(null);
  protected readonly type = signal<ProfessorLinkType>('ARENA_STAFF');
  protected readonly permissions = signal<ProfessorPermissions>(defaultProfessorPermissions('ARENA_STAFF'));
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly rows = computed(() => {
    const links = this.links();
    const now = Date.now();
    return this.results().map((account) => ({ account, state: accountLinkState(links, account.id, now) }));
  });

  /** A lista é ao vivo: se o escolhido pediu vínculo enquanto o modal estava aberto, trava. */
  protected readonly canSend = computed(() => {
    const picked = this.picked();
    return picked != null && accountLinkState(this.links(), picked.id, Date.now()) === 'available';
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearTimeout(this.timer);
    });
  }

  protected onTerm(value: string): void {
    this.term.set(value);
    this.picked.set(null);
    if (this.timer) clearTimeout(this.timer);
    if (value.trim().length < 2) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    const seq = ++this.seq;
    this.searching.set(true);
    this.timer = setTimeout(() => {
      this.service
        .searchAccounts(value)
        .then((r) => {
          if (seq === this.seq) this.results.set(r);
        })
        .catch(() => {
          if (seq === this.seq) this.results.set([]);
        })
        .finally(() => {
          if (seq === this.seq) this.searching.set(false);
        });
    }, 300);
  }

  /** Trocar o tipo volta a proposta para o padrão dele. */
  protected setType(type: ProfessorLinkType): void {
    if (type === this.type()) return;
    this.type.set(type);
    this.permissions.set(defaultProfessorPermissions(type));
  }

  protected setPermission(change: PermissionChange): void {
    this.permissions.update((current) => ({ ...current, [change.key]: change.value }));
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pageUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    } catch {
      this.error.set(`Não foi possível copiar. Link da página: ${this.pageUrl()}`);
    }
  }

  protected dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected async send(): Promise<void> {
    const picked = this.picked();
    if (!picked || !this.canSend() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.service.invite({
        arenaId: this.arenaId(),
        professorUserId: picked.id,
        relationshipType: this.type(),
        permissions: this.permissions(),
        message: this.message().trim() || null,
      });
      this.sent.emit(picked.name);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar o convite.');
    } finally {
      this.busy.set(false);
    }
  }
}

/** A3 · Analisar solicitação — aprova com as permissões ajustadas aqui (proposta padrão do
 *  tipo), rejeita (o pai abre a confirmação com motivo) ou deixa para depois. */
@Component({
  selector: 'ar-prof-analyze-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, AvatarComponent, ProfessorTypeTagComponent, ProfessorPermListComponent, ProfessorNoteComponent],
  styleUrl: '../aulas/aulas-form.scss',
  template: `
    <ar-modal size="lg" (close)="dismiss()">
      <p class="modal-title">Solicitação de vínculo</p>
      <p class="modal-sub">{{ link().professorName }}{{ sentLabel() ? ' · ' + sentLabel() : '' }}</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      } @else if (!open()) {
        <div class="error-banner">Esta solicitação não está mais aberta ({{ statusLabel() }}).</div>
      }

      <div class="who">
        <ar-avatar [name]="link().professorName" [photoUrl]="link().professorPhotoUrl" [size]="52" zoomable personRole="Professor" />
        <div class="who-text">
          <div class="who-name">{{ link().professorName }}</div>
          <div class="who-sub">{{ modalities() }}</div>
        </div>
      </div>

      <div class="ask">
        <div class="ask-head">
          <span class="kick">Quer atuar como</span>
          <ar-prof-type-tag [type]="link().relationshipType" [sm]="true" />
        </div>
        @if (link().message; as msg) {
          <div class="ask-msg">“{{ msg }}”</div>
        } @else {
          <div class="ask-msg dim">Sem mensagem.</div>
        }
      </div>

      <div class="field-label spaced">Permissões ao aprovar</div>
      <ar-prof-perm-list
        [permissions]="permissions()"
        [editable]="true"
        [dense]="true"
        [disabled]="busy() || !open()"
        (changed)="setPermission($event)"
      />

      <ar-prof-note>Você só vê os dados públicos do perfil. Os vínculos de {{ first() }} com outras arenas não aparecem aqui.</ar-prof-note>

      <div class="modal-actions">
        <button type="button" class="ar-ghost-btn danger-text" [disabled]="busy() || !open()" (click)="rejectRequested.emit()">Rejeitar</button>
        <span class="grow"></span>
        <button type="button" class="ar-ghost-btn" [disabled]="busy()" (click)="dismiss()">Decidir depois</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !open()" (click)="approve()">
          {{ busy() ? 'Aprovando…' : 'Aprovar vínculo' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: [
    SHARED_STYLES,
    `
    .who { display: flex; align-items: center; gap: 14px; margin-top: 4px; }
    .who-text { flex: 1; min-width: 0; }
    .who-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 17px; color: var(--nx-text); }
    .who-sub { font-size: 12px; color: var(--nx-text-dim); margin-top: 3px; }
    .ask { margin-top: 16px; padding: 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .ask-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .kick {
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .ask-msg { font-size: 13px; color: var(--nx-text); margin-top: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .ask-msg.dim { color: var(--nx-text-dim); }
  `,
  ],
})
export class ProfessorAnalyzeModalComponent {
  private readonly service = inject(ArenaProfessorsService);

  readonly link = input.required<ArenaProfessorLink>();
  readonly closed = output<void>();
  readonly approved = output<string>();
  readonly rejectRequested = output<void>();

  /** Ajustes do gestor sobre a proposta gravada; `null` = ainda a proposta do pedido. */
  private readonly edited = signal<ProfessorPermissions | null>(null);
  protected readonly permissions = computed(() => this.edited() ?? this.link().permissions);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly open = computed(() => this.link().status === 'PENDING');
  protected readonly statusLabel = computed(() => PROFESSOR_STATUS_META[this.link().status].label.toLowerCase());
  protected readonly first = computed(() => firstName(this.link().professorName));
  protected readonly modalities = computed(() => this.link().professorModalities.join(' · ') || 'Modalidades não informadas');
  protected readonly sentLabel = computed(() => {
    const at = this.link().requestedAt;
    return at ? `enviada em ${dayMonthLabel(at, Date.now())} às ${timeLabel(at)}` : '';
  });

  protected setPermission(change: PermissionChange): void {
    this.edited.set({ ...this.permissions(), [change.key]: change.value });
  }

  protected dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected async approve(): Promise<void> {
    if (this.busy() || !this.open()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.service.approve(this.link().id, this.permissions());
      this.approved.emit(this.link().professorName);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível aprovar a solicitação.');
    } finally {
      this.busy.set(false);
    }
  }
}

/** A5 · Suspender vínculo — motivo obrigatório (vai para o professor junto com os detalhes);
 *  revoga as permissões sem apagar a configuração, que volta na reativação. */
@Component({
  selector: 'ar-prof-suspend-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  styleUrl: '../aulas/aulas-form.scss',
  template: `
    <ar-modal (close)="dismiss()">
      <p class="modal-title">Suspender vínculo</p>
      <p class="modal-sub">{{ link().professorName }} · {{ typeLabel() }}</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }
      <div class="field-label spaced">Motivo</div>
      <div class="chip-row" role="radiogroup" aria-label="Motivo da suspensão">
        @for (r of reasons; track r) {
          <button type="button" class="ar-chip" role="radio" [attr.aria-checked]="reason() === r" [class.active]="reason() === r" (click)="reason.set(r)">
            {{ r }}
          </button>
        }
      </div>
      <div class="field-label spaced">Detalhes (enviado ao professor)</div>
      <textarea
        class="input-box"
        maxlength="500"
        placeholder="Ex.: 3 reservas de setembro em aberto. Reativamos assim que forem quitadas."
        aria-label="Detalhes da suspensão"
        [value]="details()"
        (input)="details.set($any($event.target).value)"
      ></textarea>
      <div class="field-label spaced">O que acontece</div>
      <div class="effects">
        <div class="effect">
          <span class="effect-dot"></span>
          <div><span class="e-title">Permissões revogadas</span><span class="e-sub"> · As permissões deste vínculo deixam de valer e ele sai da página da arena</span></div>
        </div>
        <div class="effect">
          <span class="effect-dot"></span>
          <div><span class="e-title">Outras arenas</span><span class="e-sub"> · Os vínculos de {{ first() }} com outras arenas não mudam</span></div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="ar-ghost-btn" [disabled]="busy()" (click)="dismiss()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary danger" [disabled]="busy() || !reason()" (click)="confirm()">
          {{ busy() ? 'Suspendendo…' : 'Suspender e notificar' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: [
    SHARED_STYLES,
    `
    .effects { display: flex; flex-direction: column; gap: 8px; }
    .effect { display: flex; gap: 10px; }
    .effect-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--nx-live); margin-top: 6px; flex: none; }
    .e-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .e-sub { font-size: 12px; color: var(--nx-text-dim); }
  `,
  ],
})
export class ProfessorSuspendModalComponent {
  private readonly service = inject(ArenaProfessorsService);

  readonly link = input.required<ArenaProfessorLink>();
  readonly closed = output<void>();
  readonly suspended = output<void>();

  protected readonly reasons = SUSPENSION_REASONS;
  protected readonly reason = signal<string | null>(null);
  protected readonly details = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly typeLabel = computed(() => PROFESSOR_TYPE_META[this.link().relationshipType].label);
  protected readonly first = computed(() => firstName(this.link().professorName));

  protected dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected async confirm(): Promise<void> {
    const reason = this.reason();
    if (!reason || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.service.suspend(this.link().id, reason, this.details().trim() || null);
      this.suspended.emit();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível suspender o vínculo.');
    } finally {
      this.busy.set(false);
    }
  }
}

/** Confirmação genérica (rejeitar pedido, encerrar vínculo, cancelar convite) com motivo
 *  opcional. Quem chama executa a ação e devolve `busy`/`error` — o erro fica dentro do
 *  diálogo, com ele aberto. */
@Component({
  selector: 'ar-prof-confirm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  styleUrl: '../aulas/aulas-form.scss',
  template: `
    <ar-modal (close)="dismiss()">
      <p class="modal-title">{{ title() }}</p>
      <p class="modal-sub">{{ subtitle() }}</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }
      @if (withReason()) {
        <div class="field-label spaced">{{ reasonLabel() }}</div>
        <textarea
          class="input-box"
          maxlength="300"
          [placeholder]="reasonPlaceholder()"
          [attr.aria-label]="reasonLabel()"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
        ></textarea>
      }
      <div class="modal-actions">
        <button type="button" class="ar-ghost-btn" [disabled]="busy()" (click)="dismiss()">Voltar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary danger" [disabled]="busy()" (click)="confirmed.emit(reason().trim() || null)">
          {{ busy() ? busyLabel() : confirmLabel() }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: SHARED_STYLES,
})
export class ProfessorConfirmModalComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly confirmLabel = input.required<string>();
  readonly busyLabel = input('Salvando…');
  readonly withReason = input(false);
  readonly reasonLabel = input('Motivo (opcional, enviado ao professor)');
  readonly reasonPlaceholder = input('');
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly closed = output<void>();
  readonly confirmed = output<string | null>();

  protected readonly reason = signal('');

  protected dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }
}
