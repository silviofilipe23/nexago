import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import type { ArenaProfessorLink } from './arena-professor.model';
import {
  CHANNEL_MAX_TEXT,
  arenaChannelConversationId,
  channelState,
  channelStateNote,
  composerText,
  groupMessagesByDay,
  messageTimeLabel,
  showSenderName,
  unreadFor,
  type ArenaChannel,
  type ChannelMessage,
} from './arena-professor-channel.model';
import { ArenaProfessorChannelService } from './arena-professor-channel.service';
import { ProfessorNoteComponent } from './professor-ui';

/** D4 · Canal da gestão com um professor vinculado (espelho do `MsAppArena` do app do professor).
 *  Abre pelo callable (vínculo ATIVO + escrita em `perfil`), ouve as mensagens ao vivo, envia pelo
 *  callable e zera as não lidas de quem está vendo. Vínculo fora de ATIVO: histórico só leitura. */
@Component({
  selector: 'ar-prof-channel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, AvatarComponent, IconComponent, ProfessorNoteComponent],
  template: `
    <ar-panel-card class="chat-card">
      <div class="chat">
        <div class="chat-head">
          <ar-avatar [name]="link().professorName" [photoUrl]="link().professorPhotoUrl" [size]="36" />
          <div class="head-text">
            <div class="head-name">{{ link().professorName }}</div>
            <div class="head-sub">{{ headSub() }}</div>
          </div>
        </div>

        <div class="scroller" #scroller role="log" aria-live="polite" aria-label="Mensagens do canal">
          @if (state() === 'no-access' || state() === 'inactive') {
            <div class="empty">
              <div class="empty-icon"><ar-icon name="mail" [size]="22" /></div>
              <p class="empty-text">{{ stateNote() }}</p>
            </div>
          } @else if (opening()) {
            <p class="state-text">Abrindo o canal…</p>
          } @else if (loadError(); as err) {
            <div class="empty"><p class="empty-text">{{ err }}</p></div>
          } @else if (groups().length === 0) {
            <div class="empty">
              <div class="empty-icon"><ar-icon name="mail" [size]="22" /></div>
              <p class="empty-text">
                Nenhuma mensagem ainda. Avisos de quadra, mudança de agenda e combinados com
                {{ firstName() }} ficam aqui — toda a gestão da arena vê a mesma conversa.
              </p>
            </div>
          } @else {
            @for (g of groups(); track g.key) {
              <div class="day">{{ g.label }}</div>
              @for (m of g.messages; track m.id; let i = $index) {
                <div class="msg" [class.out]="isMine(m)">
                  @if (showName(g.messages, i)) {
                    <span class="who">{{ m.senderName }}</span>
                  }
                  <div class="bubble" [class.auto]="m.auto">
                    <span class="text">{{ m.text }}</span>
                    <span class="time">{{ m.auto ? 'resposta automática · ' : '' }}{{ timeOf(m) }}</span>
                  </div>
                </div>
              }
            }
          }
        </div>

        @if (state() === 'open') {
          <div class="composer">
            @if (sendError(); as err) {
              <div class="send-error" role="alert">{{ err }}</div>
            }
            <div class="composer-row">
              <textarea
                class="composer-input"
                rows="1"
                [attr.maxlength]="maxText"
                placeholder="Mensagem para {{ firstName() }} · Enter envia, Shift+Enter quebra linha"
                [attr.aria-label]="'Mensagem para ' + link().professorName"
                [value]="draft()"
                [disabled]="opening() || !conversationId()"
                (input)="draft.set($any($event.target).value)"
                (keydown.enter)="onEnter($any($event))"
              ></textarea>
              <button
                type="button"
                class="send-btn"
                aria-label="Enviar mensagem"
                [disabled]="!canSend()"
                (click)="send()"
              >
                @if (sending()) {
                  <span class="ar-spinner" aria-hidden="true"></span>
                } @else {
                  <ar-icon name="chevron-right" [size]="18" />
                }
              </button>
            </div>
          </div>
        } @else if (state() === 'closed') {
          <ar-prof-note tone="yellow" class="closed-note">{{ stateNote() }}</ar-prof-note>
        }
      </div>
    </ar-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .chat-card { display: block; }
    .chat {
      display: flex; flex-direction: column; min-height: 0;
      height: clamp(420px, calc(100vh - 300px), 760px);
      margin: calc(var(--ar-card-pad) * -1);
    }
    .chat-head {
      flex: none; display: flex; align-items: center; gap: 12px;
      padding: 14px 20px; border-bottom: 1px solid var(--nx-line);
    }
    .head-text { min-width: 0; }
    .head-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); }
    .head-sub {
      font-family: var(--nx-font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--nx-text-dim); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .scroller {
      flex: 1; min-height: 0; overflow-y: auto; padding: 20px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .state-text { font-size: 13px; color: var(--nx-text-mute); margin: auto; }
    .empty { margin: auto; max-width: 420px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .empty-icon {
      width: 48px; height: 48px; border-radius: 16px; background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3); display: grid; place-items: center; color: var(--nx-orange-500);
    }
    .empty-text { font-size: 13px; color: var(--nx-text-mute); line-height: 1.55; margin: 0; }

    .day {
      align-self: center; font-family: var(--nx-font-mono); font-size: 10px; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--nx-text-dim); margin: 6px 0 2px;
    }
    .msg { align-self: flex-start; max-width: min(460px, 80%); display: flex; flex-direction: column; gap: 3px; }
    .msg.out { align-self: flex-end; align-items: flex-end; }
    .who { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: var(--nx-orange-500); padding-left: 4px; }
    .bubble {
      padding: 10px 14px; border-radius: 16px 16px 16px 4px; background: var(--nx-surface-1);
      border: 1px solid var(--nx-line); color: var(--nx-text); font-size: 13.5px; line-height: 1.45;
      display: flex; flex-direction: column; gap: 4px;
    }
    .bubble.auto { border-style: dashed; }
    .msg.out .bubble {
      border-radius: 16px 16px 4px 16px; background: var(--nx-orange-500); border-color: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }
    .text { white-space: pre-wrap; overflow-wrap: anywhere; }
    .time { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); align-self: flex-end; }
    .msg.out .time { color: rgba(10, 10, 10, 0.62); }

    .composer { flex: none; border-top: 1px solid var(--nx-line); padding: 12px 20px 16px; display: flex; flex-direction: column; gap: 8px; }
    .composer-row { display: flex; gap: 10px; align-items: flex-end; }
    .composer-input {
      flex: 1; min-width: 0; min-height: 44px; max-height: 160px; resize: vertical; box-sizing: border-box;
      padding: 12px 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong); color: var(--nx-text); font-family: var(--nx-font-ui);
      font-size: 13.5px; line-height: 1.4;
    }
    .composer-input:focus { outline: none; border-color: var(--nx-orange-500); }
    .composer-input::placeholder { color: var(--nx-text-dim); }
    .send-btn {
      flex: none; width: 44px; height: 44px; border-radius: var(--nx-r-3); border: none; cursor: pointer;
      background: var(--nx-orange-500); color: var(--nx-text-on-orange); display: grid; place-items: center;
    }
    .send-btn:disabled { opacity: 0.45; cursor: default; }
    .send-error {
      border-radius: var(--nx-r-2); border: 1px solid var(--nx-live); background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live); padding: 8px 12px; font-size: 12.5px;
    }
    .closed-note { display: block; margin: 0 20px 16px; }
  `,
})
export class ProfessorChannelComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(ArenaProfessorChannelService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly link = input.required<ArenaProfessorLink>();
  /** Escrita na área `perfil` — a régua de quem é membro do canal. */
  readonly canWrite = input.required<boolean>();

  protected readonly maxText = CHANNEL_MAX_TEXT;
  protected readonly uid = computed(() => this.auth.user()?.uid ?? null);

  protected readonly channel = signal<ArenaChannel | null>(null);
  protected readonly messages = signal<ChannelMessage[]>([]);
  protected readonly conversationId = signal<string | null>(null);
  protected readonly opening = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);
  private readonly now = signal(Date.now());
  private markingRead = false;

  protected readonly state = computed(() =>
    channelState({ canWrite: this.canWrite(), linkStatus: this.link().status, channel: this.channel() }),
  );
  protected readonly stateNote = computed(() => channelStateNote(this.state(), this.link().status, this.link().professorName));
  protected readonly firstName = computed(() => this.link().professorName.trim().split(/\s+/)[0] || 'o professor');
  protected readonly groups = computed(() => groupMessagesByDay(this.messages(), this.now()));
  protected readonly canSend = computed(
    () => this.state() === 'open' && !!this.conversationId() && !this.sending() && composerText(this.draft()) != null,
  );
  protected readonly headSub = computed(() => {
    const staff = (this.channel()?.memberIds ?? []).filter((m) => m !== this.link().professorUserId).length;
    const base = 'Canal com o professor';
    return staff > 0 ? `${base} · ${staff} da gestão na conversa` : base;
  });

  /** Chave do canal: muda só quando muda o que decide abrir/ouvir (não a cada snapshot do vínculo). */
  private readonly channelKey = computed(() => {
    const link = this.link();
    const uid = this.uid();
    if (!uid || !this.canWrite()) return null;
    return { arenaId: link.arenaId, professorUid: link.professorUserId, active: link.status === 'ACTIVE' };
  }, { equal: (a, b) => a?.arenaId === b?.arenaId && a?.professorUid === b?.professorUid && a?.active === b?.active });

  constructor() {
    effect((onCleanup) => {
      const key = this.channelKey();
      untracked(() => this.reset());
      if (!key) return;
      let stopped = false;
      const stops: Array<() => void> = [];
      const listen = (conversationId: string) => {
        if (stopped) return;
        this.conversationId.set(conversationId);
        stops.push(this.service.watchChannel(conversationId, (c) => this.channel.set(c)));
        stops.push(
          this.service.watchMessages(
            conversationId,
            (messages) => {
              this.messages.set(messages);
              this.loadError.set(null);
            },
            // Fora de ATIVO, "sem permissão" só quer dizer que não há histórico pra mostrar.
            (message) => (key.active ? this.loadError.set(message) : this.messages.set([])),
          ),
        );
      };
      if (key.active) {
        this.opening.set(true);
        this.service
          .open(key.arenaId, key.professorUid)
          .then(({ conversationId }) => listen(conversationId))
          .catch((err: unknown) => {
            if (!stopped) this.loadError.set(err instanceof Error ? err.message : 'Não foi possível abrir o canal.');
          })
          .finally(() => {
            if (!stopped) this.opening.set(false);
          });
      } else {
        // Sem vínculo ativo não dá pra abrir; se já houve conversa, o histórico continua legível.
        listen(arenaChannelConversationId(key.arenaId, key.professorUid));
      }
      onCleanup(() => {
        stopped = true;
        stops.forEach((s) => s());
      });
    });

    // Quem está com o canal aberto leu: zera o contador dele (uma chamada por vez).
    effect(() => {
      const channel = this.channel();
      const unread = unreadFor(channel, this.uid());
      if (!channel || unread === 0 || this.markingRead) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      this.markingRead = true;
      this.service
        .markRead(channel.id)
        .catch(() => undefined)
        .finally(() => (this.markingRead = false));
    });

    // Nova mensagem: rola até o fim.
    effect(() => {
      this.groups();
      const el = this.scroller()?.nativeElement;
      if (el) setTimeout(() => (el.scrollTop = el.scrollHeight));
    });

    const tick = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  protected isMine(m: ChannelMessage): boolean {
    return m.senderUid === this.uid();
  }

  protected showName(messages: ChannelMessage[], index: number): boolean {
    return showSenderName(messages, index, this.uid());
  }

  protected timeOf(m: ChannelMessage): string {
    return messageTimeLabel(m);
  }

  protected onEnter(event: KeyboardEvent): void {
    if (event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void this.send();
  }

  protected async send(): Promise<void> {
    const id = this.conversationId();
    const text = composerText(this.draft());
    if (!id || !text || !this.canSend()) return;
    this.sending.set(true);
    this.sendError.set(null);
    try {
      await this.service.send(id, text);
      this.draft.set('');
    } catch (err) {
      this.sendError.set(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      this.sending.set(false);
    }
  }

  private reset(): void {
    this.channel.set(null);
    this.messages.set([]);
    this.conversationId.set(null);
    this.loadError.set(null);
    this.opening.set(false);
    this.sendError.set(null);
  }
}
