import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import type { ArenaProfessorLink } from './arena-professor.model';
import {
  ARENA_NOTICE_KINDS,
  NOTICE_MAX_BODY,
  NOTICE_MAX_TITLE,
  noticeAudienceCount,
  noticeDraftError,
  noticeInput,
  noticeKindMeta,
  noticeReadLabel,
  noticeRecipientOptions,
  noticeSentLabel,
  type ArenaNoticeKind,
  type ArenaProfessorNotice,
  type NoticeDraft,
} from './arena-professor-channel.model';
import { ArenaProfessorChannelService } from './arena-professor-channel.service';
import { ArenaProfessorsService } from './arena-professors.service';
import { ProfessorNoteComponent } from './professor-ui';

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

/** F6 · Comunicados aos professores — a gestão escreve (aviso/agenda/evento) para todos os
 *  professores com vínculo ativo ou para alguns, e acompanha quantos leram. Envio só pelo callable
 *  `sendArenaProfessorNotice` (valida vínculo ativo e manda o push). Escrita em `perfil`. */
@Component({
  selector: 'ar-panel-professor-notices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, AvatarComponent, ProfessorNoteComponent],
  styleUrls: ['../aulas/aulas-form.scss'],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Comunicados aos professores" [subtitle]="subtitle()">
        <button type="button" class="ar-mini-btn" (click)="back()">
          <ar-icon name="chevron-left" [size]="14" />
          Profissionais
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg"><p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p></ar-panel-card>
        } @else if (loadingView()) {
          <ar-panel-card pad="lg"><p class="state-text">Carregando…</p></ar-panel-card>
        } @else if (!canWrite()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Comunicados aos professores são enviados pela gestão da arena: só quem pode editar Perfil acessa esta tela.</p>
          </ar-panel-card>
        } @else {
          @if (notice(); as n) {
            <div class="notice" [class.error]="n.tone === 'error'" role="status">
              <span>{{ n.text }}</span>
              <button type="button" class="notice-dismiss" aria-label="Fechar aviso" (click)="notice.set(null)">×</button>
            </div>
          }

          <div class="ar-split layout">
            <ar-panel-card title="Enviados" [kicker]="sentKicker()">
              @if (listError(); as err) {
                <p class="state-text">{{ err }}</p>
              } @else {
                <div class="sent-list">
                  @for (n of notices(); track n.id) {
                    <article class="sent" [class.open]="expandedId() === n.id">
                      <button type="button" class="sent-head" [attr.aria-expanded]="expandedId() === n.id" (click)="toggle(n.id)">
                        <span class="kind-tag" [style.color]="kindColor(n.kind)" [style.border-color]="kindColor(n.kind)">{{ kindLabel(n.kind) }}</span>
                        <span class="sent-title">{{ n.title }}</span>
                        <span class="sent-reads" [class.all]="n.recipientCount > 0 && n.readCount >= n.recipientCount">{{ readLabel(n) }}</span>
                      </button>
                      <div class="sent-meta">{{ sentLabel(n) }} · por {{ n.authorName }}</div>
                      <p class="sent-body">{{ n.body }}</p>
                    </article>
                  } @empty {
                    <div class="empty">
                      <div class="empty-icon"><ar-icon name="bell" [size]="22" /></div>
                      <p class="state-text">
                        Nenhum comunicado enviado ainda. Use para avisar manutenção de quadra, mudanças de agenda
                        ou eventos da arena — cada professor recebe no app e pode repassar aos alunos dele daqui.
                      </p>
                    </div>
                  }
                </div>
              }
            </ar-panel-card>

            <ar-panel-card title="Novo comunicado" kicker="Para os professores vinculados">
              <div class="field-label">Tipo</div>
              <div class="chip-row kinds" role="radiogroup" aria-label="Tipo do comunicado">
                @for (k of kinds; track k.id) {
                  <button type="button" role="radio" class="ar-chip" [class.active]="kind() === k.id" [attr.aria-checked]="kind() === k.id" (click)="kind.set(k.id)">
                    {{ k.label }}
                  </button>
                }
              </div>

              <div class="field-label spaced label-row">
                <span>Título</span><span class="count">{{ title().length }}/{{ maxTitle }}</span>
              </div>
              <input
                class="input-box"
                type="text"
                [attr.maxlength]="maxTitle"
                placeholder="Ex.: Quadra 2 em manutenção sábado"
                aria-label="Título do comunicado"
                [value]="title()"
                [disabled]="busy()"
                (input)="title.set($any($event.target).value)"
              />

              <div class="field-label spaced label-row">
                <span>Mensagem</span><span class="count">{{ body().length }}/{{ maxBody }}</span>
              </div>
              <textarea
                class="input-box body-input"
                [attr.maxlength]="maxBody"
                placeholder="O que os professores precisam saber"
                aria-label="Mensagem do comunicado"
                [value]="body()"
                [disabled]="busy()"
                (input)="body.set($any($event.target).value)"
              ></textarea>

              <div class="field-label spaced">Para quem</div>
              <div class="audience" role="radiogroup" aria-label="Destinatários">
                <button type="button" role="radio" class="aud" [class.on]="audience() === 'all'" [attr.aria-checked]="audience() === 'all'" (click)="audience.set('all')">
                  <span class="radio"></span>
                  <span class="aud-text">
                    <span class="aud-title">Todos os professores ativos</span>
                    <span class="aud-sub">{{ options().length }} {{ options().length === 1 ? 'professor' : 'professores' }} com vínculo ativo</span>
                  </span>
                </button>
                <button type="button" role="radio" class="aud" [class.on]="audience() === 'pick'" [attr.aria-checked]="audience() === 'pick'" (click)="audience.set('pick')">
                  <span class="radio"></span>
                  <span class="aud-text">
                    <span class="aud-title">Escolher professores</span>
                    <span class="aud-sub">{{ picked().length }} selecionado(s)</span>
                  </span>
                </button>
              </div>

              @if (audience() === 'pick') {
                <div class="pick-list">
                  @for (o of options(); track o.uid) {
                    <label class="pick">
                      <input type="checkbox" [checked]="picked().includes(o.uid)" [disabled]="busy()" (change)="togglePick(o.uid)" />
                      <ar-avatar [name]="o.name" [photoUrl]="o.photoUrl" [size]="28" />
                      <span class="pick-name">{{ o.name }}</span>
                    </label>
                  } @empty {
                    <p class="state-text">Nenhum professor com vínculo ativo.</p>
                  }
                </div>
              }

              @if (touched() && draftError(); as err) {
                <div class="error-banner form-error">{{ err }}</div>
              }

              <ar-prof-note class="send-note">
                Cada professor recebe uma notificação no app. Só vínculos ativos recebem — suspensos e encerrados ficam de fora.
              </ar-prof-note>

              <div class="actions">
                <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || (touched() && !!draftError())" (click)="send()">
                  {{ busy() ? 'Enviando…' : sendLabel() }}
                </button>
              </div>
            </ar-panel-card>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    @use 'breakpoints' as ar;

    .body {
      flex: 1; min-height: 0; padding: var(--ar-pad-page-y) var(--ar-pad-page-x) 28px;
      display: flex; flex-direction: column; gap: 16px; overflow: auto;
    }
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; line-height: 1.5; }

    .notice {
      flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      border-radius: var(--nx-r-2); border: 1px solid rgba(43, 209, 126, 0.35); background: rgba(43, 209, 126, 0.08);
      padding: 10px 14px; font-size: 12.5px; color: var(--nx-win);
    }
    .notice.error { border-color: var(--nx-live); background: rgba(255, 59, 48, 0.08); color: var(--nx-live); }
    .notice-dismiss { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; }

    .layout { --ar-split-aside: 400px; }

    .sent-list { display: flex; flex-direction: column; }
    .sent { padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .sent:last-child { border-bottom: none; }
    .sent-head {
      width: 100%; display: flex; align-items: center; gap: 10px; background: none; border: none; padding: 0;
      cursor: pointer; text-align: left; color: inherit;
    }
    .sent-head:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; border-radius: 4px; }
    .kind-tag {
      flex: none; height: 20px; padding: 0 8px; border-radius: 5px; border: 1px solid; display: inline-flex; align-items: center;
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    }
    .sent-title {
      flex: 1; min-width: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sent-reads { flex: none; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-mute); }
    .sent-reads.all { color: var(--nx-win); }
    .sent-meta { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 5px; }
    .sent-body {
      margin: 8px 0 0; font-size: 12.5px; color: var(--nx-text-mute); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .sent.open .sent-body { display: block; -webkit-line-clamp: unset; }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 24px 12px; }
    .empty-icon {
      width: 48px; height: 48px; border-radius: 16px; background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3); display: grid; place-items: center; color: var(--nx-orange-500);
    }

    .kinds { display: flex; gap: 8px; flex-wrap: wrap; }
    .label-row { display: flex; justify-content: space-between; }
    .count { color: var(--nx-text-dim); }
    textarea.body-input { min-height: 140px; }

    .audience { display: flex; flex-direction: column; gap: 8px; }
    .aud {
      display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: var(--nx-r-3); cursor: pointer;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: inherit; text-align: left;
    }
    .aud.on { border-color: var(--nx-orange-500); }
    .radio { flex: none; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--nx-line-strong); display: grid; place-items: center; }
    .aud.on .radio { border-color: var(--nx-orange-500); }
    .aud.on .radio::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--nx-orange-500); }
    .aud-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .aud-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .aud-sub { font-size: 11.5px; color: var(--nx-text-dim); }

    .pick-list {
      margin-top: 10px; max-height: 240px; overflow-y: auto; display: flex; flex-direction: column;
      border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); padding: 4px 12px;
    }
    .pick { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--nx-line); cursor: pointer; }
    .pick:last-child { border-bottom: none; }
    .pick input { accent-color: var(--nx-orange-500); width: 16px; height: 16px; }
    .pick-name { font-size: 13px; color: var(--nx-text); }

    .form-error { margin-top: 14px; margin-bottom: 0; }
    .send-note { margin-top: 14px; }
    .actions { display: flex; justify-content: flex-end; margin-top: 16px; }
  `,
})
export class PanelProfessorNoticesComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly professors = inject(ArenaProfessorsService);
  private readonly service = inject(ArenaProfessorChannelService);
  private readonly router = inject(Router);

  protected readonly kinds = ARENA_NOTICE_KINDS;
  protected readonly maxTitle = NOTICE_MAX_TITLE;
  protected readonly maxBody = NOTICE_MAX_BODY;

  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly canWrite = computed(() => this.access.ready() && this.access.canWrite('perfil'));

  private readonly links = signal<ArenaProfessorLink[]>([]);
  protected readonly notices = signal<ArenaProfessorNotice[]>([]);
  private readonly loading = signal(true);
  protected readonly listError = signal<string | null>(null);
  protected readonly loadingView = computed(() => this.arenaContext.loading() || (this.canWrite() && this.loading()));
  private readonly now = signal(Date.now());

  protected readonly kind = signal<ArenaNoticeKind>('aviso');
  protected readonly title = signal('');
  protected readonly body = signal('');
  protected readonly audience = signal<'all' | 'pick'>('all');
  protected readonly picked = signal<string[]>([]);
  protected readonly touched = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly expandedId = signal<string | null>(null);

  protected readonly options = computed(() => noticeRecipientOptions(this.links()));
  private readonly draft = computed<NoticeDraft>(() => ({
    kind: this.kind(),
    title: this.title(),
    body: this.body(),
    audience: this.audience(),
    // Quem saiu de ATIVO depois de marcado não vai no envio.
    picked: this.picked().filter((uid) => this.options().some((o) => o.uid === uid)),
  }));
  protected readonly draftError = computed(() => noticeDraftError(this.draft(), this.options().length));
  protected readonly sendLabel = computed(() => {
    const n = noticeAudienceCount(this.draft(), this.options().length);
    return n === 1 ? 'Enviar para 1 professor' : `Enviar para ${n} professores`;
  });

  protected readonly subtitle = computed(() => `${this.arenaContext.arenaName() ?? 'Arena'} · avisos, agenda e eventos para a equipe de professores`);
  protected readonly sentKicker = computed(() => {
    const n = this.notices().length;
    return n === 0 ? 'nenhum ainda' : n === 1 ? '1 comunicado' : `${n} comunicados`;
  });

  constructor() {
    effect((onCleanup) => {
      const arenaId = this.arenaContext.arenaId();
      this.links.set([]);
      this.notices.set([]);
      this.listError.set(null);
      this.loading.set(true);
      if (!arenaId || !this.canWrite()) {
        this.loading.set(false);
        return;
      }
      const stopLinks = this.professors.watchLinks(arenaId, (links) => this.links.set(links), () => undefined);
      const stopNotices = this.service.watchNotices(
        arenaId,
        (notices) => {
          this.notices.set(notices);
          this.loading.set(false);
        },
        (message) => {
          this.listError.set(message);
          this.loading.set(false);
        },
      );
      onCleanup(() => {
        stopLinks();
        stopNotices();
      });
    });

    const tick = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  protected back(): void {
    void this.router.navigate(['/painel/profissionais']);
  }

  protected kindLabel(kind: ArenaNoticeKind): string {
    return noticeKindMeta(kind).label;
  }

  protected kindColor(kind: ArenaNoticeKind): string {
    return noticeKindMeta(kind).color;
  }

  protected readLabel(n: ArenaProfessorNotice): string {
    return noticeReadLabel(n);
  }

  protected sentLabel(n: ArenaProfessorNotice): string {
    return noticeSentLabel(n, this.now());
  }

  protected toggle(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  protected togglePick(uid: string): void {
    this.picked.update((list) => (list.includes(uid) ? list.filter((u) => u !== uid) : [...list, uid]));
  }

  protected async send(): Promise<void> {
    if (this.busy()) return;
    this.touched.set(true);
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.draftError()) return;
    this.busy.set(true);
    this.notice.set(null);
    try {
      const { recipientCount } = await this.service.sendNotice(noticeInput(arenaId, this.draft()));
      this.title.set('');
      this.body.set('');
      this.picked.set([]);
      this.audience.set('all');
      this.touched.set(false);
      this.notice.set({
        tone: 'ok',
        text: recipientCount === 1 ? 'Comunicado enviado para 1 professor.' : `Comunicado enviado para ${recipientCount} professores.`,
      });
    } catch (err) {
      this.notice.set({ tone: 'error', text: err instanceof Error ? err.message : 'Não foi possível enviar o comunicado.' });
    } finally {
      this.busy.set(false);
    }
  }
}
