import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { sendCategoryCommunication } from '../data/organizer-ops.service';
import type { OrganizerTournament } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

type Audience = 'all' | 'paid' | 'pending';

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'Todos os inscritos',
  paid: 'Só confirmados (pagos)',
  pending: 'Só pendentes',
};

interface SentResult {
  pushCount: number;
  whatsappLinks: Array<{ teamId: string; links: string[] }>;
}

interface SentLogEntry {
  at: Date;
  categoryName: string;
  audience: Audience;
  message: string;
  pushCount: number;
}

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Comunicação real com os atletas — espelha `organizer_category_communicate_page.dart`
 *  (Flutter): broadcast por categoria via `sendCategoryCommunication` (push pros dois atletas
 *  de cada dupla + links de WhatsApp prontos, que o servidor monta a partir dos telefones).
 *  Na cascata o torneio vem da rota (`/painel/eventos/:id/comunicacao`); no nível categoria
 *  (`…/categorias/:catId/comunicacao`) a categoria também vem travada da rota. O backend não
 *  persiste histórico de avisos (o retorno é só pushCount/links), então o histórico aqui é da
 *  sessão. */
@Component({
  selector: 'og-comunicacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgFormFieldComponent, OgToggleRowComponent, NxSpinnerComponent],
  template: `
    <og-page-header title="Comunicação" [subtitle]="headerSubtitle()" />

    <div class="og-content" style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px;align-items:start">
      <og-card kicker="Broadcast" title="Novo aviso">
        @if (loading()) {
          <p class="og-comm-empty">Carregando torneio…</p>
        } @else if (!tournament()) {
          <p class="og-comm-empty">Torneio não encontrado.</p>
        } @else if (categories().length === 0) {
          <p class="og-comm-empty">Este torneio não tem categorias.</p>
        } @else {
          @if (lockedCategoryName(); as locked) {
            <og-form-field label="Categoria">
              <div class="og-comm-fixed">{{ locked }}</div>
            </og-form-field>
          } @else {
            <og-form-field label="Categoria">
              <select class="og-comm-select" [value]="selectedCategoryId()" (change)="onCategory($event)">
                @for (c of categories(); track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
            </og-form-field>
          }

          <div style="margin-top:14px">
            <og-form-field label="Público">
              <div class="og-filter-bar">
                @for (a of audiences; track a) {
                  <button type="button" class="og-chip" [class.active]="audience() === a" (click)="audience.set(a)">{{ audienceLabel[a] }}</button>
                }
              </div>
            </og-form-field>
          </div>

          <div style="margin-top:14px">
            <og-form-field label="Mensagem">
              <textarea
                class="og-comm-textarea"
                rows="4"
                maxlength="500"
                placeholder="Ex.: Atenção: os jogos de amanhã começam às 8h. Cheguem 30min antes."
                [value]="message()"
                (input)="message.set($any($event.target).value)"
              ></textarea>
            </og-form-field>
          </div>

          <div style="margin-top:10px">
            <og-toggle-row title="Enviar push no app" desc="Além dos links de WhatsApp, notifica os atletas no nexaGO." [on]="sendPush()" (toggled)="sendPush.set($event)" />
          </div>

          @if (feedback(); as fb) {
            <div class="og-banner" [class.win]="fb.ok" style="margin-top:12px">{{ fb.message }}</div>
          }

          <div style="margin-top:14px;display:flex;justify-content:flex-end">
            <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="sending() || !canSend()" (click)="send()">
              @if (sending()) {
                <app-nx-spinner [size]="14" tone="dark" />
              } @else {
                <og-icon name="mail" [size]="14" />
              }
              {{ sending() ? 'Enviando…' : 'Enviar aviso' }}
            </button>
          </div>
        }
      </og-card>

      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        @if (lastResult(); as result) {
          <og-card kicker="WhatsApp" title="Links de conversa">
            @if (result.whatsappLinks.length === 0) {
              <p class="og-comm-empty">Nenhum telefone cadastrado entre os destinatários.</p>
            } @else {
              <p class="og-comm-hint">Clique pra abrir a conversa já com a mensagem preenchida:</p>
              <div class="og-comm-links">
                @for (team of result.whatsappLinks; track team.teamId; let i = $index) {
                  @for (link of team.links; track link; let j = $index) {
                    <a class="og-mini-btn" [href]="link" target="_blank" rel="noopener">Dupla {{ i + 1 }} · atleta {{ j + 1 }}</a>
                  }
                }
              </div>
            }
          </og-card>
        }

        <og-card kicker="Sessão" title="Avisos enviados">
          @for (s of sentLog(); track s.at.getTime()) {
            <div class="og-comm-aviso">
              <div class="og-comm-aviso-top">
                <div class="og-comm-aviso-title">{{ s.categoryName }}</div>
                <span class="og-comm-aviso-date">{{ timeOf(s.at) }}</span>
              </div>
              <div class="og-comm-aviso-body">{{ s.message }}</div>
              <div class="og-comm-aviso-footer">
                <span class="og-comm-aviso-alcance">{{ audienceLabel[s.audience] }} · {{ s.pushCount }} push enviados</span>
              </div>
            </div>
          } @empty {
            <p class="og-comm-empty">Nenhum aviso enviado nesta sessão.</p>
          }
        </og-card>
      </div>
    </div>
  `,
  styles: `
    .og-comm-select {
      width: 100%;
      height: 38px;
      padding: 0 10px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .og-comm-fixed {
      display: flex;
      align-items: center;
      height: 38px;
      padding: 0 10px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
    }
    .og-comm-textarea {
      width: 100%;
      resize: vertical;
      padding: 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.5;
    }
    .og-comm-textarea:focus {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 0;
    }
    .og-comm-hint {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
      margin: 0 0 10px;
    }
    .og-comm-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-comm-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .og-comm-aviso {
      padding: 14px 16px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      margin-bottom: 12px;
    }
    .og-comm-aviso:last-of-type {
      margin-bottom: 0;
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
      font-size: 13px;
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
  `,
})
export class ComunicacaoComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly audiences: Audience[] = ['all', 'paid', 'pending'];
  protected readonly audienceLabel = AUDIENCE_LABEL;

  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly selectedCategoryId = signal<string | null>(null);
  protected readonly audience = signal<Audience>('all');
  protected readonly message = signal('');
  protected readonly sendPush = signal(true);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly lastResult = signal<SentResult | null>(null);
  protected readonly sentLog = signal<SentLogEntry[]>([]);

  protected readonly categories = computed(() => this.tournament()?.categories ?? []);

  /** Categoria fixa quando a tela é aberta no nível 3 da cascata (rota da categoria). */
  protected readonly lockedCategoryName = computed<string | null>(() => {
    const cid = this.catId();
    if (!cid) return null;
    return this.categories().find((c) => c.id === cid)?.name ?? null;
  });

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    if (!t) return 'Aviso em broadcast pros inscritos — push no app + WhatsApp';
    const locked = this.lockedCategoryName();
    return locked ? `${t.name} · categoria ${locked}` : `${t.name} · avisos aos participantes`;
  });

  protected readonly canSend = computed(() => this.selectedCategoryId() != null && this.message().trim().length > 0);

  constructor() {
    effect(() => {
      const tid = this.id();
      this.tournament.set(null);
      this.selectedCategoryId.set(null);
      if (!tid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid);
    });
  }

  private async load(tid: string): Promise<void> {
    try {
      const tournament = await getTournament(tid);
      this.tournament.set(tournament);
      const cid = this.catId();
      const categories = tournament?.categories ?? [];
      const initial = (cid && categories.some((c) => c.id === cid) ? cid : null) ?? categories[0]?.id ?? null;
      this.selectedCategoryId.set(initial);
    } finally {
      this.loading.set(false);
    }
  }

  protected onCategory(event: Event): void {
    this.selectedCategoryId.set((event.target as HTMLSelectElement).value);
  }

  protected async send(): Promise<void> {
    const tid = this.id();
    const cid = this.selectedCategoryId();
    if (!tid || !cid || !this.canSend() || this.sending()) return;
    this.sending.set(true);
    this.feedback.set(null);
    try {
      const result = (await sendCategoryCommunication({
        tournamentId: tid,
        categoryId: cid,
        message: this.message(),
        audience: this.audience(),
        sendPush: this.sendPush(),
      })) as unknown as SentResult;
      const pushCount = result.pushCount ?? 0;
      const links = result.whatsappLinks ?? [];
      this.lastResult.set({ pushCount, whatsappLinks: links });
      this.feedback.set({ ok: true, message: `Aviso enviado — ${pushCount} push${links.length ? ` · ${links.length} duplas com WhatsApp` : ''}.` });
      this.sentLog.update((log) => [
        {
          at: new Date(),
          categoryName: this.categories().find((c) => c.id === cid)?.name ?? cid,
          audience: this.audience(),
          message: this.message().trim(),
          pushCount,
        },
        ...log,
      ]);
      this.message.set('');
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao enviar o aviso.' });
    } finally {
      this.sending.set(false);
    }
  }

  protected timeOf(d: Date): string {
    return TIME.format(d);
  }
}
