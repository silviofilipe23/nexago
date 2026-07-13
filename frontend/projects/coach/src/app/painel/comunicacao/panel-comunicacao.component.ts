import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

interface ChatMessage {
  me: boolean;
  name: string;
  text: string;
  time: string;
}

const MESSAGES: ChatMessage[] = [
  { me: false, name: 'Carla Mendes', text: 'Pessoal, treino de sexta muda para quadra 2.', time: '09:02' },
  { me: true, name: 'Você', text: 'Beleza, chego 15 antes pra ajudar a montar.', time: '09:05' },
  { me: false, name: 'Lucas Ramos', text: 'Vou passar no fisio amanhã, te aviso como fico pro treino.', time: '09:11' },
  { me: false, name: 'Ana Beatriz', text: 'Ok, confirmado! 📎 video-recepcao.mp4', time: '09:14' },
];

/** Comunicação (protótipo TrComunicacaoScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-comunicacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Comunicação" subtitle="Chat da equipe Adulto Masculino" />

      <div class="body">
        <co-panel-card pad="sm" title="Conversas" class="conversations-card">
          <co-row title="Equipe Adulto Masculino" sub="24 membros">
            <div row-avatar class="team-avatar">TE</div>
            <co-pill row-trailing tone="orange">3</co-pill>
          </co-row>
          <co-row title="Ana Beatriz" sub="Ok, confirmado!">
            <co-athlete-avatar row-avatar initials="AB" [size]="32" status="ativo" />
          </co-row>
          <co-row title="Lucas Ramos" sub="Vou passar no fisio amanhã" [last]="true">
            <co-athlete-avatar row-avatar initials="LR" [size]="32" status="lesionado" />
          </co-row>
        </co-panel-card>

        <div class="chat-column">
          <co-panel-card title="Aviso fixado" kicker="No topo do chat" class="pinned-card">
            📌 Levar atestado médico atualizado até sexta-feira.
          </co-panel-card>
          <co-panel-card class="messages-card">
            @for (m of messages; track m.time) {
              <div class="bubble-wrap" [class.me]="m.me">
                @if (!m.me) {
                  <div class="bubble-name">{{ m.name }}</div>
                }
                <div class="bubble" [class.me]="m.me">{{ m.text }}</div>
                <div class="bubble-time">{{ m.time }}</div>
              </div>
            }
          </co-panel-card>
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 20px 32px 28px;
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 16px;
      min-height: 0;
      overflow: hidden;
    }
    .conversations-card {
      min-height: 0;
      overflow: hidden;
    }
    .team-avatar {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
    }
    .chat-column {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }
    .pinned-card {
      flex: none;
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .messages-card {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .bubble-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .bubble-wrap.me {
      align-items: flex-end;
    }
    .bubble-name {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      margin-bottom: 3px;
    }
    .bubble {
      max-width: 320px;
      padding: 9px 13px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.4;
    }
    .bubble.me {
      background: var(--nx-orange-500);
      border: none;
      color: var(--nx-text-on-orange);
    }
    .bubble-time {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }
  `,
})
export class PanelComunicacaoComponent {
  protected readonly messages = MESSAGES;
}
