import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { unreadBadge } from '../profissionais/arena-professor-channel.model';
import { dayMonthLabel, timeLabel } from '../profissionais/arena-professor.model';
import { AvatarComponent } from '../ui/avatar.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { AulaChatComponent } from './aula-chat.component';
import { aulaPreview, aulaUnread, type AulaConversation } from './aulas-chat.model';
import { AulasChatService } from './aulas-chat.service';
import { AulasPageComponent } from './aulas-ui';

/** Mensagens das Aulas: a caixa da gestão com os alunos (chat do app no lugar do WhatsApp) e a
 *  conversa aberta ao lado. A conversa nasce no aluno ("Mensagem") ou na mensalidade ("Cobrar");
 *  o push da resposta do aluno abre `/painel/aulas/mensagens/{id}`. */
@Component({
  selector: 'ar-panel-aulas-messages',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, AvatarComponent, AulaChatComponent, RouterLink],
  template: `
    <ar-aulas-page title="Aulas" subtitle="Conversas com os alunos pelo app NexaGO" tab="mensagens">
      <div class="layout" [class.has-open]="!!openId()">
        <ar-panel-card class="list-card" title="Conversas">
          @for (c of inbox(); track c.id) {
            <a class="row" [class.active]="c.id === openId()" [routerLink]="['/painel/aulas/mensagens', c.id]">
              <ar-avatar [name]="c.athleteName" [photoUrl]="c.athletePhotoUrl" [size]="36" />
              <div class="row-text">
                <div class="row-top">
                  <span class="row-name">{{ c.athleteName }}</span>
                  <span class="row-time">{{ when(c) }}</span>
                </div>
                <div class="row-bottom">
                  <span class="row-preview">{{ preview(c) }}</span>
                  @if (unread(c); as n) {
                    <span class="badge" [attr.aria-label]="n + ' não lidas'">{{ badge(n) }}</span>
                  }
                </div>
              </div>
            </a>
          } @empty {
            <p class="hint">
              Nenhuma conversa ainda. Abra um aluno e use "Mensagem", ou "Cobrar" numa mensalidade —
              a conversa fica aqui e o aluno responde pelo app NexaGO.
            </p>
          }
        </ar-panel-card>
        <div class="chat-col">
          @if (openId(); as id) {
            <a class="back ar-mini-btn" routerLink="/painel/aulas/mensagens">‹ Conversas</a>
            <ar-aula-chat [conversationId]="id" />
          } @else {
            <p class="pick">Escolha uma conversa.</p>
          }
        </div>
      </div>
    </ar-aulas-page>
  `,
  styles: `
    @use 'breakpoints' as ar;
    .layout { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 16px; align-items: start; }
    .chat-col { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    .back { display: none; align-self: flex-start; }
    .pick { margin: 40px auto; font-size: 13px; color: var(--nx-text-mute); }
    .row {
      display: flex; gap: 10px; align-items: center; padding: 10px; margin: 0 -10px; border-radius: var(--nx-r-2);
      text-decoration: none; color: inherit;
    }
    .row:hover { background: var(--nx-surface-1); }
    .row.active { background: var(--nx-orange-tint); }
    .row-text { flex: 1; min-width: 0; }
    .row-top, .row-bottom { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
    .row-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .row-time { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); flex: none; }
    .row-preview { font-size: 12.5px; color: var(--nx-text-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .badge {
      flex: none; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; box-sizing: border-box;
      background: var(--nx-orange-500); color: var(--nx-text-on-orange); font-size: 10.5px; font-weight: 700;
      display: grid; place-items: center;
    }
    .hint { font-size: 13px; color: var(--nx-text-mute); line-height: 1.5; margin: 0; }
    @include ar.below(md) {
      .layout { grid-template-columns: 1fr; }
      .layout.has-open .list-card { display: none; }
      .layout:not(.has-open) .chat-col { display: none; }
      .back { display: inline-flex; }
    }
  `,
})
export class PanelAulasMessagesComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(AulasChatService);

  protected readonly openId = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('conversationId'))), {
    initialValue: null,
  });
  protected readonly inbox = computed(() => this.service.inbox());
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);

  constructor() {
    this.service.startInbox();
  }

  protected preview(c: AulaConversation): string {
    return aulaPreview(c, this.uid());
  }

  protected unread(c: AulaConversation): number {
    return c.id === this.openId() ? 0 : aulaUnread(c, this.uid());
  }

  protected badge(n: number): string {
    return unreadBadge(n);
  }

  protected when(c: AulaConversation): string {
    if (!c.lastAt) return '';
    const now = Date.now();
    return new Date(now).toDateString() === c.lastAt.toDateString() ? timeLabel(c.lastAt) : dayMonthLabel(c.lastAt, now);
  }
}
