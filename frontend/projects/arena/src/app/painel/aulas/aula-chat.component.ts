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
import {
  CHANNEL_MAX_TEXT,
  composerText,
  groupMessagesByDay,
  messageTimeLabel,
  type ChannelMessage,
} from '../profissionais/arena-professor-channel.model';
import { aulaUnread, type AulaConversation } from './aulas-chat.model';
import { AulasChatService } from './aulas-chat.service';

/** Conversa da gestão com um aluno das Aulas (o espelho da tela do app). Ouve a conversa e as
 *  mensagens ao vivo, envia pelo callable e zera as não lidas de quem está vendo. O "Cobrar" chega
 *  com a mensagem pronta no composer — quem cobra revisa e envia. Encerrada: só leitura. */
@Component({
  selector: 'ar-aula-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, AvatarComponent, IconComponent],
  template: `
    <ar-panel-card class="chat-card">
      <div class="chat">
        <div class="chat-head">
          <ar-avatar [name]="name()" [photoUrl]="conversation()?.athletePhotoUrl ?? null" [size]="36" />
          <div class="head-text">
            <div class="head-name">{{ name() }}</div>
            <div class="head-sub">Aluno · responde pelo app NexaGO</div>
          </div>
        </div>

        <div class="scroller" #scroller role="log" aria-live="polite" aria-label="Mensagens com o aluno">
          @if (missing()) {
            <div class="empty"><p class="empty-text">Esta conversa não está disponível para você.</p></div>
          } @else if (loadError(); as err) {
            <div class="empty"><p class="empty-text">{{ err }}</p></div>
          } @else if (groups().length === 0) {
            <div class="empty">
              <div class="empty-icon"><ar-icon name="mail" [size]="22" /></div>
              <p class="empty-text">
                Nenhuma mensagem ainda. {{ firstName() }} recebe pelo app NexaGO, com notificação, e
                responde por aqui.
              </p>
            </div>
          } @else {
            @for (g of groups(); track g.key) {
              <div class="day">{{ g.label }}</div>
              @for (m of g.messages; track m.id) {
                <div class="msg" [class.out]="isMine(m)">
                  <div class="bubble">
                    <span class="text">{{ m.text }}</span>
                    <span class="time">{{ timeOf(m) }}</span>
                  </div>
                </div>
              }
            }
          }
        </div>

        @if (conversation()?.closed) {
          <p class="closed-note">Conversa encerrada: o aluno não está mais nas aulas da arena. O histórico fica guardado.</p>
        } @else if (!missing()) {
          <div class="composer">
            @if (sendError(); as err) {
              <div class="send-error" role="alert">{{ err }}</div>
            }
            <div class="composer-row">
              <textarea
                class="composer-input"
                rows="3"
                [attr.maxlength]="maxText"
                placeholder="Mensagem para {{ firstName() }} · Enter envia, Shift+Enter quebra linha"
                [attr.aria-label]="'Mensagem para ' + name()"
                [value]="draft()"
                (input)="draft.set($any($event.target).value)"
                (keydown.enter)="onEnter($any($event))"
              ></textarea>
              <button type="button" class="send-btn" aria-label="Enviar mensagem" [disabled]="!canSend()" (click)="send()">
                @if (sending()) {
                  <span class="ar-spinner" aria-hidden="true"></span>
                } @else {
                  <ar-icon name="chevron-right" [size]="18" />
                }
              </button>
            </div>
          </div>
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
    .chat-head { flex: none; display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--nx-line); }
    .head-text { min-width: 0; }
    .head-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); }
    .head-sub {
      font-family: var(--nx-font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--nx-text-dim); margin-top: 2px;
    }
    .scroller { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
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
    .msg { align-self: flex-start; max-width: min(460px, 80%); display: flex; flex-direction: column; }
    .msg.out { align-self: flex-end; align-items: flex-end; }
    .bubble {
      padding: 10px 14px; border-radius: 16px 16px 16px 4px; background: var(--nx-surface-1);
      border: 1px solid var(--nx-line); color: var(--nx-text); font-size: 13.5px; line-height: 1.45;
      display: flex; flex-direction: column; gap: 4px;
    }
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
      flex: 1; min-width: 0; min-height: 44px; max-height: 200px; resize: vertical; box-sizing: border-box;
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
    .closed-note { flex: none; margin: 0; padding: 12px 20px 16px; border-top: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-pending); }
  `,
})
export class AulaChatComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(AulasChatService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly conversationId = input.required<string>();

  protected readonly maxText = CHANNEL_MAX_TEXT;
  protected readonly uid = computed(() => this.auth.user()?.uid ?? null);
  protected readonly conversation = signal<AulaConversation | null>(null);
  protected readonly missing = signal(false);
  protected readonly messages = signal<ChannelMessage[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);
  private readonly now = signal(Date.now());
  private markingRead = false;

  protected readonly name = computed(() => this.conversation()?.athleteName ?? 'Aluno');
  protected readonly firstName = computed(() => this.name().trim().split(/\s+/)[0] || 'o aluno');
  protected readonly groups = computed(() => groupMessagesByDay(this.messages(), this.now()));
  protected readonly canSend = computed(
    () => !!this.conversation() && !this.conversation()!.closed && !this.sending() && composerText(this.draft()) != null,
  );

  constructor() {
    effect((onCleanup) => {
      const id = this.conversationId();
      untracked(() => {
        this.conversation.set(null);
        this.missing.set(false);
        this.messages.set([]);
        this.loadError.set(null);
        this.sendError.set(null);
        this.draft.set(this.service.takeDraft(id));
      });
      if (!id) {
        this.missing.set(true);
        return;
      }
      const stops = [
        this.service.watchConversation(id, (c) => {
          this.conversation.set(c);
          this.missing.set(c == null);
        }),
        this.service.watchMessages(
          id,
          (m) => {
            this.messages.set(m);
            this.loadError.set(null);
          },
          (message) => this.loadError.set(message),
        ),
      ];
      onCleanup(() => stops.forEach((s) => s()));
    });

    // Quem está com a conversa aberta leu: zera o contador dele (uma chamada por vez).
    effect(() => {
      const c = this.conversation();
      if (!c || aulaUnread(c, this.uid()) === 0 || this.markingRead) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      this.markingRead = true;
      this.service
        .markRead(c.id)
        .catch(() => undefined)
        .finally(() => (this.markingRead = false));
    });

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

  protected timeOf(m: ChannelMessage): string {
    return messageTimeLabel(m);
  }

  protected onEnter(event: KeyboardEvent): void {
    if (event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void this.send();
  }

  protected async send(): Promise<void> {
    const c = this.conversation();
    const text = composerText(this.draft());
    if (!c || !text || !this.canSend()) return;
    this.sending.set(true);
    this.sendError.set(null);
    try {
      await this.service.send(c.id, text);
      this.draft.set('');
    } catch (err) {
      this.sendError.set(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      this.sending.set(false);
    }
  }
}
