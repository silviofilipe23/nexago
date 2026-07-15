import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OG_AVISOS, OG_MENSAGENS, initialsOf } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

/** Avisos em broadcast por evento e mensagens diretas com participantes. */
@Component({
  selector: 'og-comunicacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgPillComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Comunicação" subtitle="Avisos gerais e mensagens diretas com participantes">
      <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="plus" [size]="14" />Novo aviso</button>
    </og-page-header>

    <div class="og-content" style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;overflow:hidden">
      <og-card kicker="Broadcast" title="Avisos enviados" style="min-height:0;overflow:hidden">
        <div style="display:flex;flex-direction:column;gap:14px;overflow-y:auto;scrollbar-width:none">
          @for (a of avisos; track a.title) {
            <div class="og-comm-aviso">
              <div class="og-comm-aviso-top">
                <div class="og-comm-aviso-title">{{ a.title }}</div>
                <span class="og-comm-aviso-date">{{ a.date }}</span>
              </div>
              <div class="og-comm-aviso-body">{{ a.body }}</div>
              <div class="og-comm-aviso-footer">
                <og-pill tone="dim">{{ a.evento }}</og-pill>
                <span class="og-comm-aviso-alcance">{{ a.alcance }} destinatários</span>
              </div>
            </div>
          }
        </div>
      </og-card>

      <og-card kicker="Diretas" title="Mensagens" pad="0" style="min-height:0">
        <div style="flex:1;overflow-y:auto;scrollbar-width:none">
          @for (m of mensagens; track m.name; let last = $last) {
            <div class="og-comm-msg" [class.unread]="m.unread" [class.last]="last">
              <og-avatar [initials]="initialsOf(m.name)" [size]="36" />
              <div style="flex:1;min-width:0">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span class="og-comm-msg-name" [class.unread]="m.unread">{{ m.name }}</span>
                  <span class="og-comm-msg-time">{{ m.time }}</span>
                </div>
                <div class="og-comm-msg-preview" [class.unread]="m.unread">{{ m.preview }}</div>
              </div>
              @if (m.unread) {
                <span class="og-comm-msg-dot"></span>
              }
            </div>
          }
        </div>
      </og-card>
    </div>
  `,
  styles: `
    .og-comm-aviso {
      padding: 14px 16px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
    }
    .og-comm-aviso-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .og-comm-aviso-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .og-comm-aviso-date {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .og-comm-aviso-body {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin-top: 6px;
      line-height: 1.5;
    }
    .og-comm-aviso-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    .og-comm-aviso-alcance {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .og-comm-msg {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-comm-msg.last {
      border-bottom: none;
    }
    .og-comm-msg.unread {
      background: var(--nx-orange-tint);
    }
    .og-comm-msg-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-comm-msg-name.unread {
      font-weight: 700;
    }
    .og-comm-msg-time {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-comm-msg-preview {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-comm-msg-preview.unread {
      color: var(--nx-text-mute);
    }
    .og-comm-msg-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      flex: none;
    }
  `,
})
export class ComunicacaoComponent {
  protected readonly avisos = OG_AVISOS;
  protected readonly mensagens = OG_MENSAGENS;
  protected readonly initialsOf = initialsOf;
}
