import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { tournamentCoverOrDefault } from '@nexago/tournament-covers';
import { environment } from '../../../environments/environment';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { listMatches } from '../data/matches-repository';
import { cancelTournament, closeTournamentRegistrations } from '../data/organizer-ops.service';
import { isPaidRegistrationsRejection } from '../data/tournament-cancel-escalation';
import type { OrganizerTournament, OrganizerTournamentSponsor, OrganizerTournamentStatus } from '../data/tournament.model';
import { EMPTY_TOURNAMENT_COLLECTED, formatCentsShort } from '../data/tournament-collected';
import { tournamentUsesUniform } from '../data/uniforms';
import { addTournamentSponsor, getTournament, removeTournamentSponsor, validateSponsorLogoFile } from '../data/tournaments-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent, type OgIconName } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { OgCompartilharTorneioDialogComponent } from './compartilhar-torneio-dialog.component';

const STATUS_LABEL: Record<OrganizerTournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  encerradas: 'Inscrições encerradas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

/** Ações do torneio que passam pelo diálogo de confirmação. `cancelPaid` não é um botão: é o
 *  segundo degrau do cancelamento, quando o servidor recusa por haver inscrições pagas. */
type PendingAction = 'close' | 'cancel' | 'cancelPaid';

const CONFIRM_COPY: Record<PendingAction, { title: string; message: string; confirmLabel: string }> = {
  close: {
    title: 'Encerrar inscrições?',
    message:
      'As inscrições de TODAS as categorias deste torneio fecham. Quem já se inscreveu continua na lista; ninguém novo entra.',
    confirmLabel: 'Encerrar inscrições',
  },
  cancel: {
    title: 'Cancelar torneio?',
    message: 'Os atletas inscritos serão notificados e o torneio sai do catálogo público.',
    confirmLabel: 'Cancelar torneio',
  },
  cancelPaid: {
    title: 'Há inscrições pagas',
    message:
      'Este torneio já tem inscrições pagas. Cancelar mesmo assim é possível, mas a plataforma não estorna — a devolução fica por sua conta, combinada fora dela.',
    confirmLabel: 'Cancelar mesmo assim',
  },
};

/** Atalhos do torneio no telefone — os mesmos itens da sidebar contextual (nível torneio). */
interface ToolLink {
  label: string;
  icon: OgIconName;
  path: string;
  badge: number | null;
}

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

interface CategoriaRow {
  id: string;
  name: string;
  taken: number;
  total: number | null;
  pagas: number;
  pend: number;
  full: boolean;
  /** "duplas" ou "equipes" (categoria trio/quarteto/quinteto). */
  unit: string;
  /** Chave já sorteada (categoria com jogos) — regerar apagaria resultados. */
  hasMatches: boolean;
}

/** Visão geral do torneio — hub do nível 2 da cascata: KPIs + grade de categorias,
 *  onde o organizador seleciona a categoria pra descer ao nível 3 (operação). As telas
 *  de inscritos e jogos que viviam em abas aqui viraram itens da sidebar contextual. */
@Component({
  selector: 'og-torneio-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeActions()' },
  imports: [
    RouterLink,
    OgPageHeaderComponent,
    OgIconComponent,
    OgPillComponent,
    NxSpinnerComponent,
    OgCompartilharTorneioDialogComponent,
    OgConfirmDialogComponent,
    OgCardComponent,
    OgFormFieldComponent,
  ],
  template: `
    <og-page-header [title]="tournament()?.name ?? 'Torneio'" [subtitle]="headerSubtitle()">
      @if (tournament(); as t) {
        @if (canShare()) {
          <button type="button" class="og-mini-btn og-mini-btn-primary og-torneio-hdr-act" (click)="shareOpen.set(true)">
            <og-icon name="share" [size]="14" />Compartilhar
          </button>
        }
        @if (t.status === 'inscricoes') {
          <button type="button" class="og-ghost-btn og-torneio-hdr-act" [disabled]="acting()" (click)="ask('close')">
            @if (actingKind() === 'close') {
              <app-nx-spinner [size]="12" />
            }
            {{ actingKind() === 'close' ? 'Encerrando…' : 'Encerrar inscrições' }}
          </button>
        }
        @if (t.status !== 'cancelado' && t.status !== 'concluido') {
          <button type="button" class="og-ghost-btn og-torneio-danger og-torneio-hdr-act" [disabled]="acting()" (click)="ask('cancel')">
            @if (actingKind() === 'cancel') {
              <app-nx-spinner [size]="12" />
            }
            {{ actingKind() === 'cancel' ? 'Cancelando…' : 'Cancelar torneio' }}
          </button>
        }
        <a class="og-mini-btn og-torneio-hdr-act" routerLink="/painel/novo-torneio" [queryParams]="{ editar: t.id }"
          ><og-icon name="edit" [size]="14" />Editar torneio</a
        >
      }
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando torneio…</div>
      } @else if (!tournament()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Torneio não encontrado.</div>
      } @else {
        @if (cover(); as capa) {
          @if (!coverFailed()) {
            <div class="og-torneio-hero" aria-hidden="true">
              <img [src]="capa" alt="" (error)="coverFailed.set(true)" />
            </div>
          }
        }
        <!-- Só no telefone (o CSS acende): o subtítulo do cabeçalho some abaixo de 1024px e as
             ações do cabeçalho abaixo de 640px — status, data, local e ações voltam aqui, com
             alvos de 48px. Encerrar/cancelar ficam na folha "Mais ações". -->
        @if (tournament(); as t) {
          <div class="og-torneio-m">
            <span class="og-torneio-m-status" [attr.data-status]="t.status">{{ statusLabel() }}</span>
            <div class="og-torneio-m-meta">
              <span><og-icon name="calendar" [size]="16" />{{ shareDateLabel() ?? 'Data a definir' }}</span>
              <span><og-icon name="pin" [size]="16" />{{ sharePlace() ?? 'Local a definir' }}</span>
            </div>
            <div class="og-torneio-m-actions">
              @if (canShare()) {
                <button type="button" class="og-torneio-m-btn primary" (click)="shareOpen.set(true)">
                  <og-icon name="share" [size]="18" />Compartilhar
                </button>
              }
              <a class="og-torneio-m-btn" routerLink="/painel/novo-torneio" [queryParams]="{ editar: t.id }">
                <og-icon name="edit" [size]="17" />Editar
              </a>
              @if (hasSheetActions()) {
                <button
                  #actionsTrigger
                  type="button"
                  class="og-torneio-m-btn icon"
                  aria-label="Mais ações do torneio"
                  aria-haspopup="dialog"
                  [disabled]="acting()"
                  (click)="openActions()"
                >
                  <og-icon name="more" [size]="20" />
                </button>
              }
            </div>
            @if (collected().toVerifyCents > 0) {
              <a class="og-torneio-m-alert" [routerLink]="['/painel/eventos', id(), 'inscricoes']">
                <og-icon name="alert" [size]="18" />
                <span>
                  <strong>{{ money(collected().toVerifyCents) }} a conferir</strong>
                  <small>Pagamentos diretos esperando sua confirmação</small>
                </span>
                <og-icon name="chevron" [size]="16" />
              </a>
            }
          </div>
        }
        @if (feedback(); as fb) {
          <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
        }
        <div class="og-kpi-row og-torneio-kpis" [class.over-hero]="cover() && !coverFailed()">
          <a class="og-card og-card-pad-sm og-torneio-kpi og-torneio-kpi-link" [routerLink]="['/painel/eventos', id(), 'inscricoes']">
            <div class="og-kpi-label">Inscritos</div>
            <div class="og-kpi-value sm">{{ inscritosCount() }}</div>
          </a>
          <a class="og-card og-card-pad-sm og-torneio-kpi og-torneio-kpi-link" [routerLink]="['/painel/eventos', id(), 'inscricoes']">
            <div class="og-kpi-label">Pendentes</div>
            <div class="og-kpi-value sm og-torneio-kpi-pend">{{ pendentesCount() }}</div>
          </a>
          <div class="og-card og-card-pad-sm og-torneio-kpi">
            <div class="og-kpi-label">Categorias</div>
            <div class="og-kpi-value sm">{{ categoriasCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm og-torneio-kpi">
            <div class="og-kpi-label">Arrecadado</div>
            <div class="og-kpi-value sm og-torneio-kpi-win">{{ money(collected().totalCents) }}</div>
            @if (collectedSplit(); as split) {
              <div class="og-torneio-kpi-split">{{ split }}</div>
            }
          </div>
        </div>

        <!-- Só no telefone: a sidebar contextual vira gaveta, e as ferramentas do torneio
             ficavam a dois toques. Aqui ficam na tela, com o número de pendentes. -->
        <nav class="og-torneio-tools" aria-label="Gerenciar torneio">
          <h2 class="og-torneio-m-title">Gerenciar torneio</h2>
          <div class="og-torneio-tools-grid">
            @for (tool of tools(); track tool.path) {
              <a class="og-torneio-tool" [routerLink]="['/painel/eventos', id(), tool.path]">
                <og-icon [name]="tool.icon" [size]="22" [strokeWidth]="1.9" />
                <span>{{ tool.label }}</span>
                @if (tool.badge) {
                  <span class="og-torneio-tool-badge" [attr.aria-label]="tool.badge + ' pendentes'">{{ tool.badge }}</span>
                }
              </a>
            }
          </div>
        </nav>

        <div class="og-torneio-cats-head">
          <div>
            <div class="og-torneio-cats-kicker">CATEGORIAS · passo 2</div>
            <div class="og-torneio-cats-title">Categorias — selecione para gerenciar</div>
          </div>
          <div class="og-page-header-spacer"></div>
          <!-- mock (fase 2): adicionar categoria depois do torneio criado ainda não existe no app -->
          <button type="button" class="og-ghost-btn og-torneio-cats-add"><og-icon name="plus" [size]="13" />Adicionar categoria</button>
        </div>

        <div class="og-torneio-cats-grid">
          @for (c of categoriaRows(); track c.id) {
            <div class="og-torneio-cat" [class.highlight]="c.full">
              <a class="og-torneio-cat-body" [routerLink]="['/painel/eventos', id(), 'categorias', c.id]">
                <div class="og-torneio-cat-top">
                  <div class="og-torneio-cat-name">{{ c.name }}</div>
                  <og-pill [tone]="c.hasMatches || c.total == null ? 'dim' : c.full ? 'green' : 'orange'">
                    {{ c.hasMatches ? 'Chave gerada' : c.total == null ? 'Sem limite' : c.full ? 'Lotado' : 'Abertas' }}
                  </og-pill>
                </div>
                @if (c.total != null) {
                  <div class="og-torneio-cat-progress">
                    <div class="row">
                      <span class="frac">{{ c.taken }}<em>/{{ c.total }} {{ c.unit }}</em></span>
                      <span class="pct" [style.color]="c.full ? 'var(--nx-win)' : 'var(--nx-orange-500)'">{{ pct(c) }}%</span>
                    </div>
                    <div class="og-progress" [class.win]="c.full"><span [style.width.%]="pct(c)"></span></div>
                  </div>
                } @else {
                  <div class="og-torneio-cat-progress">
                    <div class="row"><span class="frac">{{ c.taken }}<em> {{ c.unit }} inscritas</em></span></div>
                  </div>
                }
                <div class="og-torneio-cat-footer">
                  <span class="paid">{{ c.pagas }} pagas</span>
                  @if (c.pend > 0) {
                    <span class="pend">{{ c.pend }} pend.</span>
                  }
                  <og-icon class="og-torneio-cat-chev" name="chevron" [size]="16" />
                </div>
              </a>
              <div class="og-torneio-cat-cta" [class.link-only]="!c.full || c.hasMatches">
                <a class="og-torneio-cat-cta-link" [routerLink]="['/painel/eventos', id(), 'categorias', c.id]">
                  Gerenciar categoria
                  <og-icon name="chevron" [size]="13" />
                </a>
                <div class="og-page-header-spacer"></div>
                <!-- Some quando a chave já foi gerada (categoria com jogos) — regerar apagaria resultados. -->
                @if (c.full && !c.hasMatches) {
                  <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', c.id, 'seeds']">
                    <og-icon name="bracket" [size]="13" />Gerar chave
                  </a>
                }
              </div>
            </div>
          } @empty {
            <p class="og-empty">Nenhuma categoria cadastrada ainda</p>
          }
        </div>

        <og-card title="Patrocinadores" kicker="MARKETING">
          @if (!addingSponsor()) {
            <button
              card-action
              type="button"
              class="og-ghost-btn og-sponsor-add-btn"
              aria-label="Adicionar patrocinador"
              (click)="startAddSponsor()"
            >
              <og-icon name="plus" [size]="13" />Adicionar<span class="og-sponsor-add-btn-long">&nbsp;patrocinador</span>
            </button>
          }

          @if (addingSponsor()) {
            <button type="button" class="og-sponsor-scrim" aria-label="Fechar" (click)="cancelAddSponsor()"></button>
            <div class="og-sponsor-add" role="group" aria-label="Novo patrocinador">
              <div class="og-sponsor-add-title">Novo patrocinador</div>
              <div class="og-sponsor-add-logo">
                @if (sponsorLogoPreview(); as preview) {
                  <img [src]="preview" alt="" />
                } @else {
                  <span class="og-sponsor-add-logo-empty">Logo</span>
                }
              </div>
              <div class="og-sponsor-add-fields">
                <og-form-field label="Nome do patrocinador">
                  <input
                    class="og-input-el"
                    type="text"
                    [value]="sponsorName()"
                    (input)="onSponsorNameInput($event)"
                    placeholder="Nome da empresa"
                  />
                </og-form-field>
                <button type="button" class="og-ghost-btn" [disabled]="sponsorSaving()" (click)="sponsorLogoInput.click()">
                  {{ sponsorLogoFile() ? 'Trocar logo' : 'Escolher logo' }}
                </button>
                <input #sponsorLogoInput type="file" accept="image/*" hidden (change)="onSponsorLogoPicked($event)" />
              </div>
              @if (sponsorError(); as e) {
                <p class="og-sponsor-error">{{ e }}</p>
              }
              <div class="og-sponsor-add-actions">
                <button type="button" class="og-ghost-btn" [disabled]="sponsorSaving()" (click)="cancelAddSponsor()">Cancelar</button>
                <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="!canSaveSponsor()" (click)="submitSponsor()">
                  @if (sponsorSaving()) {
                    <app-nx-spinner [size]="12" tone="dark" />
                  }
                  {{ sponsorSaving() ? 'Salvando…' : 'Adicionar' }}
                </button>
              </div>
            </div>
          }

          <div class="og-sponsor-grid">
            @for (s of sponsors(); track s.id) {
              <div class="og-sponsor-chip">
                <img class="og-sponsor-logo" [src]="s.logoUrl" [alt]="s.name" />
                <span class="og-sponsor-name">{{ s.name }}</span>
                <button type="button" class="og-mini-btn og-mini-btn-danger" (click)="askRemoveSponsor(s)">Remover</button>
              </div>
            } @empty {
              @if (!addingSponsor()) {
                <p class="og-empty">Nenhum patrocinador cadastrado ainda.</p>
              }
            }
          </div>
        </og-card>
      }
    </div>

    @if (sponsorPendingRemoval(); as s) {
      <og-confirm-dialog
        title="Remover patrocinador?"
        [message]="'&quot;' + s.name + '&quot; sai da lista do torneio.'"
        confirmLabel="Remover"
        [destructive]="true"
        [busy]="sponsorRemoving()"
        [error]="sponsorRemoveError()"
        (confirmed)="confirmRemoveSponsor(s)"
        (cancelled)="sponsorPendingRemoval.set(null)"
      />
    }

    @if (pending(); as action) {
      <og-confirm-dialog
        [title]="confirmCopy(action).title"
        [message]="confirmCopy(action).message"
        [confirmLabel]="confirmCopy(action).confirmLabel"
        [destructive]="action !== 'close'"
        [busy]="acting()"
        [error]="actionError()"
        (confirmed)="confirmPending(action)"
        (cancelled)="dismissPending()"
      />
    }

    @if (actionsOpen()) {
      @if (tournament(); as t) {
        <div class="og-torneio-sheet-backdrop" (click)="closeActions()">
          <div class="og-torneio-sheet" role="dialog" aria-modal="true" aria-labelledby="og-torneio-sheet-title" (click)="$event.stopPropagation()">
            <div class="og-torneio-sheet-head">
              <h2 id="og-torneio-sheet-title">Ações do torneio</h2>
              <button #sheetClose type="button" class="og-torneio-sheet-close" aria-label="Fechar" (click)="closeActions()">
                <og-icon name="close" [size]="20" />
              </button>
            </div>
            @if (t.status === 'inscricoes') {
              <button type="button" class="og-torneio-sheet-item" (click)="askFromSheet('close')">
                <span class="og-torneio-sheet-ico pend"><og-icon name="clock" [size]="19" /></span>
                <span>
                  <strong>Encerrar inscrições</strong>
                  <small>Fecha todas as categorias. Quem já entrou continua.</small>
                </span>
              </button>
            }
            @if (t.status !== 'cancelado' && t.status !== 'concluido') {
              <div class="og-torneio-sheet-kicker">Zona de risco</div>
              <button type="button" class="og-torneio-sheet-item danger" (click)="askFromSheet('cancel')">
                <span class="og-torneio-sheet-ico"><og-icon name="close" [size]="19" /></span>
                <span>
                  <strong>Cancelar torneio</strong>
                  <small>Atletas são avisados e o torneio sai do catálogo</small>
                </span>
              </button>
            }
          </div>
        </div>
      }
    }

    @if (shareOpen()) {
      @if (tournament(); as t) {
        <og-compartilhar-torneio-dialog
          [tournament]="t"
          [bases]="shareBases"
          [place]="sharePlace()"
          [dateLabel]="shareDateLabel()"
          (closed)="shareOpen.set(false)"
        />
      }
    }
  `,
  styles: `
    .og-torneio-kpi {
      flex: 1;
      min-width: 0;
    }
    .og-torneio-kpi-pend {
      color: var(--nx-pending);
    }
    .og-torneio-kpi-win {
      color: var(--nx-win);
    }
    .og-torneio-kpi-split {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* ── Hero de capa — background full-bleed que desvanece no fundo da página ──
       Margens negativas cancelam o padding do .og-content (22px 32px) e puxam a
       linha de KPIs 60px pra cima (gap 18 − 78), fazendo os cards flutuarem sobre
       a foto. Altura fixa: nada de layout shift quando a imagem chega. */
    .og-torneio-hero {
      position: relative;
      z-index: 0;
      height: 236px;
      flex: none;
      margin: -22px -32px -78px;
      overflow: hidden;
      pointer-events: none;
    }
    .og-torneio-hero img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transform-origin: 50% 30%;
    }
    /* Scrim: vinheta no topo (profundidade sob o cabeçalho) + fade pro fundo da
       página embaixo, onde os KPIs pousam. */
    .og-torneio-hero::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
      background:
        linear-gradient(180deg, rgba(10, 10, 10, 0.62), rgba(10, 10, 10, 0.14) 36%, transparent 58%),
        linear-gradient(180deg, transparent 42%, var(--nx-bg) 97%);
    }
    /* Brilho ambiente laranja — assinatura da marca emergindo do canto inferior. */
    .og-torneio-hero::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
      background: radial-gradient(72% 88% at 10% 100%, rgba(255, 106, 26, 0.2), transparent 62%);
    }
    /* Animação premium: revelação com "settle" de zoom + deriva Ken Burns lenta
       contínua — só transform/opacity (GPU), e nada disso com reduced-motion. */
    @media (prefers-reduced-motion: no-preference) {
      .og-torneio-hero img {
        opacity: 0;
        animation:
          og-hero-reveal 1100ms var(--nx-ease-out) 60ms forwards,
          og-hero-drift 38s ease-in-out 1200ms infinite alternate;
      }
    }
    @keyframes og-hero-reveal {
      from {
        opacity: 0;
        transform: scale(1.06);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    @keyframes og-hero-drift {
      from {
        transform: scale(1);
      }
      to {
        transform: scale(1.07) translateY(-6px);
      }
    }
    /* KPIs e banner de feedback pousam SOBRE a área do hero. */
    .og-torneio-kpis {
      position: relative;
      z-index: 2;
      flex-wrap: wrap;
    }
    .og-torneio-kpis.over-hero .og-card {
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35);
    }
    .og-banner {
      position: relative;
      z-index: 2;
    }
    .og-torneio-cats-head {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: none;
      flex-wrap: wrap;
    }
    .og-torneio-cats-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-torneio-cats-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 3px;
    }
    /* Ver og-eventos-grid: a contagem de colunas sai da largura real, não de um número fixo. */
    .og-torneio-cats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    .og-torneio-cat {
      border-radius: var(--nx-r-3);
      overflow: hidden;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      min-width: 0;
      transition: border-color 140ms var(--nx-ease-out);
    }
    .og-torneio-cat:hover {
      border-color: var(--nx-line-strong);
    }
    .og-torneio-cat.highlight {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .og-torneio-cat-body {
      padding: 16px;
      flex: 1;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }
    .og-torneio-cat-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .og-torneio-cat-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .og-torneio-cat-progress {
      margin-top: 14px;
    }
    .og-torneio-cat-progress .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .og-torneio-cat-progress .frac {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
      min-width: 0;
    }
    .og-torneio-cat-progress .frac em {
      font-style: normal;
      color: var(--nx-text-dim);
    }
    .og-torneio-cat-progress .pct {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      flex: none;
    }
    .og-torneio-cat-footer {
      margin-top: 14px;
      padding-top: 13px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      font-weight: 700;
    }
    .og-torneio-cat-footer .paid {
      color: var(--nx-win);
    }
    .og-torneio-cat-footer .pend {
      color: var(--nx-pending);
    }
    .og-torneio-cat-cta {
      padding: 11px 16px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .og-torneio-cat.highlight .og-torneio-cat-cta {
      border-top-color: rgba(255, 106, 26, 0.2);
    }
    .og-torneio-cat-cta-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-orange-500);
      text-decoration: none;
    }
    .og-torneio-cat-cta-link:hover {
      text-decoration: underline;
    }
    .og-empty {
      grid-column: 1 / -1;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-torneio-danger {
      color: var(--nx-live);
    }

    .og-sponsor-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }
    .og-sponsor-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px 6px 6px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
    }
    .og-sponsor-logo {
      width: 32px;
      height: 32px;
      border-radius: var(--nx-r-2);
      object-fit: cover;
      flex: none;
    }
    .og-sponsor-name {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text);
    }
    .og-sponsor-add {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 14px;
      padding-bottom: 16px;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-sponsor-add-logo {
      width: 56px;
      height: 56px;
      flex: none;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      display: grid;
      place-items: center;
      overflow: hidden;
      background: var(--nx-surface-1);
    }
    .og-sponsor-add-logo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .og-sponsor-add-logo-empty {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .og-sponsor-add-fields {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      flex: 1;
      min-width: 200px;
    }
    .og-sponsor-error {
      flex-basis: 100%;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 0;
    }
    .og-sponsor-add-actions {
      flex-basis: 100%;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* Tablet largo (sidebar ainda aberta): KPIs em 2×2 pra não esmagar rótulos. */
    @media (max-width: 1100px) {
      .og-torneio-kpi {
        flex: 1 1 calc(50% - 8px);
        min-width: 140px;
      }
      .og-torneio-cats-grid {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
    }

    /* Gaveta do painel: padding do .og-content vira 16/20 — o hero precisa
       espelhar senão sobra faixa lateral e os KPIs não pousam na foto. */
    @media (max-width: 1023.98px) {
      .og-torneio-hero {
        height: 200px;
        margin: -16px -20px -64px;
      }
    }

    /* ── Peças só do telefone (acesas no @media abaixo) ── */
    .og-torneio-m,
    .og-torneio-tools,
    .og-torneio-cat-chev,
    .og-sponsor-scrim,
    .og-sponsor-add-title {
      display: none;
    }
    .og-torneio-kpi-link {
      display: block;
      color: inherit;
      text-decoration: none;
      transition: border-color 140ms var(--nx-ease-out);
    }
    .og-torneio-kpi-link:hover {
      border-color: var(--nx-line-strong);
    }

    /* Folha "Mais ações" — só o botão ⋯ do telefone abre. */
    .og-torneio-sheet-backdrop {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: flex;
      align-items: flex-end;
      background: rgba(7, 7, 8, 0.66);
    }
    .og-torneio-sheet {
      width: 100%;
      padding: 8px 16px calc(24px + env(safe-area-inset-bottom));
      background: var(--nx-surface-1);
      border-top: 1px solid var(--nx-line-strong);
      border-radius: 22px 22px 0 0;
      display: flex;
      flex-direction: column;
    }
    .og-torneio-sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .og-torneio-sheet-head h2 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 18px;
      color: var(--nx-text);
    }
    .og-torneio-sheet-close {
      width: 44px;
      height: 44px;
      margin-right: -10px;
      display: grid;
      place-items: center;
      background: none;
      border: none;
      color: var(--nx-text-mute);
      cursor: pointer;
    }
    .og-torneio-sheet-item {
      min-height: 64px;
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 14px;
      background: none;
      border: none;
      border-bottom: 1px solid var(--nx-line);
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
    }
    .og-torneio-sheet-item > span:last-child,
    .og-torneio-m-alert > span {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .og-torneio-sheet-item strong,
    .og-torneio-m-alert strong {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 15px;
    }
    .og-torneio-sheet-item small,
    .og-torneio-m-alert small {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-torneio-sheet-ico {
      width: 40px;
      height: 40px;
      flex: none;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: var(--nx-surface-2);
    }
    .og-torneio-sheet-ico.pend {
      color: var(--nx-pending);
    }
    .og-torneio-sheet-kicker {
      margin: 20px 0 8px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-torneio-sheet-item.danger {
      padding: 8px 14px;
      border: 1px solid rgba(255, 59, 48, 0.28);
      border-radius: var(--nx-r-3);
      background: rgba(255, 59, 48, 0.08);
      color: #ff6b61;
    }
    .og-torneio-sheet-item.danger .og-torneio-sheet-ico {
      background: rgba(255, 59, 48, 0.14);
    }

    /* Telefone: o cabeçalho perde as ações (voltam no bloco .og-torneio-m, com 48px),
       KPIs em 2×2, ferramentas do torneio na tela, categoria = um alvo só. */
    @media (max-width: 640px) {
      .og-torneio-hdr-act,
      .og-torneio-cats-add,
      .og-torneio-cat-cta-link {
        display: none;
      }
      .og-torneio-hero {
        height: 160px;
        margin: -16px -20px -64px;
      }
      .og-torneio-m {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .og-torneio-m-status {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 26px;
        padding: 0 10px;
        border-radius: var(--nx-r-pill);
        background: var(--nx-surface-2);
        color: var(--nx-text-mute);
        font-family: var(--nx-font-display);
        font-weight: 600;
        font-size: 12px;
      }
      .og-torneio-m-status::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .og-torneio-m-status[data-status='inscricoes'] {
        background: rgba(43, 209, 126, 0.14);
        color: var(--nx-win);
      }
      .og-torneio-m-status[data-status='andamento'] {
        background: var(--nx-orange-tint);
        color: var(--nx-orange-400);
      }
      .og-torneio-m-meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-family: var(--nx-font-ui);
        font-size: 14px;
        color: var(--nx-text);
      }
      .og-torneio-m-meta > span {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .og-torneio-m-meta og-icon {
        flex: none;
        color: var(--nx-orange-400);
      }
      .og-torneio-m-actions {
        display: flex;
        gap: 8px;
      }
      .og-torneio-m-btn {
        height: 48px;
        padding: 0 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: 12px;
        border: 1px solid var(--nx-line-strong);
        background: var(--nx-surface-1);
        color: var(--nx-text);
        font-family: var(--nx-font-display);
        font-weight: 600;
        font-size: 14px;
        text-decoration: none;
        cursor: pointer;
      }
      .og-torneio-m-btn.primary {
        flex: 1;
        border: none;
        background: var(--nx-orange-500);
        color: var(--nx-text-on-orange);
        font-weight: 700;
        font-size: 15px;
      }
      .og-torneio-m-btn.icon {
        width: 48px;
        padding: 0;
        flex: none;
      }
      /* Sem Compartilhar (concluído/cancelado), Editar ocupa a linha. */
      .og-torneio-m-btn:first-child {
        flex: 1;
      }
      .og-torneio-m-alert {
        min-height: 56px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-radius: var(--nx-r-3);
        background: rgba(244, 197, 67, 0.1);
        border: 1px solid rgba(244, 197, 67, 0.28);
        color: var(--nx-text);
        text-decoration: none;
      }
      .og-torneio-m-alert > og-icon:first-child {
        flex: none;
        color: var(--nx-pending);
      }
      .og-torneio-m-alert > span {
        flex: 1;
      }
      .og-torneio-m-alert > og-icon:last-child {
        flex: none;
        color: var(--nx-text-dim);
      }
      .og-torneio-kpis {
        gap: 10px;
      }
      .og-torneio-kpi {
        flex: 1 1 calc(50% - 5px);
        min-width: 0;
      }
      .og-torneio-kpi-split {
        white-space: normal;
      }
      .og-torneio-tools {
        display: block;
        flex: none;
      }
      .og-torneio-m-title {
        margin: 6px 0 12px;
        font-family: var(--nx-font-display);
        font-weight: 700;
        font-size: 17px;
        color: var(--nx-text);
      }
      .og-torneio-tools-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .og-torneio-tool {
        position: relative;
        min-height: 84px;
        padding: 12px 6px 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: var(--nx-r-3);
        background: var(--nx-surface-0);
        border: 1px solid var(--nx-line);
        color: var(--nx-text);
        text-decoration: none;
        font-family: var(--nx-font-display);
        font-weight: 600;
        font-size: 12.5px;
        text-align: center;
      }
      .og-torneio-tool > og-icon {
        color: var(--nx-orange-400);
      }
      .og-torneio-tool-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: var(--nx-r-pill);
        background: var(--nx-pending);
        color: var(--nx-text-on-orange);
        font-family: var(--nx-font-mono);
        font-size: 11px;
        font-weight: 700;
        display: grid;
        place-items: center;
      }
      .og-torneio-cats-head {
        align-items: flex-start;
      }
      .og-torneio-cats-grid {
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .og-torneio-cat-chev {
        display: block;
        margin-left: auto;
        color: var(--nx-text-dim);
      }
      .og-torneio-cat-cta {
        padding: 0 12px 12px;
        border-top: none;
      }
      .og-torneio-cat-cta.link-only {
        display: none;
      }
      .og-torneio-cat-cta > .og-page-header-spacer {
        display: none;
      }
      .og-torneio-cat-cta > .og-mini-btn {
        width: 100%;
        height: 44px;
        justify-content: center;
        font-size: 14px;
      }
      .og-sponsor-add-btn {
        height: 44px;
        margin-left: auto;
      }
      .og-sponsor-add-btn-long {
        display: none;
      }
      .og-sponsor-chip {
        flex: 1 1 100%;
      }
      .og-sponsor-name {
        flex: 1;
        min-width: 0;
      }
      .og-sponsor-chip .og-mini-btn,
      .og-sponsor-add-actions > button {
        height: 44px;
      }
      /* O formulário de patrocinador vira folha presa na base da tela. */
      .og-sponsor-scrim {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 60;
        border: none;
        background: rgba(7, 7, 8, 0.66);
      }
      .og-sponsor-add {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 61;
        max-height: 85vh;
        overflow-y: auto;
        margin: 0;
        padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
        background: var(--nx-surface-1);
        border-top: 1px solid var(--nx-line-strong);
        border-bottom: none;
        border-radius: 22px 22px 0 0;
      }
      .og-sponsor-add-title {
        display: block;
        flex-basis: 100%;
        font-family: var(--nx-font-display);
        font-weight: 700;
        font-size: 18px;
        color: var(--nx-text);
      }
      .og-sponsor-add-fields {
        min-width: 0;
      }
      .og-sponsor-add-fields og-form-field,
      .og-sponsor-add-fields > button {
        display: flex;
        width: 100%;
      }
      .og-sponsor-add-fields > button {
        height: 44px;
        justify-content: center;
      }
      .og-sponsor-add .og-input-el {
        height: 48px;
        font-size: 16px;
      }
      .og-sponsor-add-actions > button {
        flex: 1;
        justify-content: center;
      }
    }
  `,
})
export class TorneioDetalheComponent {
  private readonly injector = inject(Injector);
  readonly id = input<string>('');

  protected readonly loading = signal(true);
  protected readonly acting = signal(false);
  /** Qual ação de header está em andamento — o botão certo mostra spinner/rótulo. */
  protected readonly actingKind = signal<'close' | 'cancel' | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  /** Ação aguardando confirmação no diálogo; `null` = nenhum diálogo aberto. */
  protected readonly pending = signal<PendingAction | null>(null);
  /** Erro da ação — fica DENTRO do diálogo, com ele aberto, e não no banner da página. */
  protected readonly actionError = signal<string | null>(null);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly inscriptions = signal<TournamentInscription[]>([]);
  /** Ids das categorias que já têm jogos gerados — controlam a oferta de "Gerar chave". */
  protected readonly categoriesWithMatches = signal<ReadonlySet<string>>(new Set<string>());
  /** Capa falhou ao carregar — o banner some (a página funciona igual sem ele). */
  protected readonly coverFailed = signal(false);

  /** Formulário de "Adicionar patrocinador" — upload só acontece ao confirmar (`submitSponsor`),
   *  não ao escolher o arquivo, pra cancelar não deixar logo órfão no Storage. */
  protected readonly addingSponsor = signal(false);
  protected readonly sponsorName = signal('');
  protected readonly sponsorLogoFile = signal<File | null>(null);
  protected readonly sponsorLogoPreview = signal<string | null>(null);
  protected readonly sponsorSaving = signal(false);
  protected readonly sponsorError = signal<string | null>(null);
  /** Patrocinador aguardando confirmação de remoção; `null` = diálogo fechado. */
  protected readonly sponsorPendingRemoval = signal<OrganizerTournamentSponsor | null>(null);
  protected readonly sponsorRemoving = signal(false);
  protected readonly sponsorRemoveError = signal<string | null>(null);

  protected readonly canSaveSponsor = computed(
    () => !this.sponsorSaving() && this.sponsorName().trim().length > 0 && this.sponsorLogoFile() != null,
  );
  protected readonly sponsors = computed(() => this.tournament()?.sponsors ?? []);

  /** Capa enviada, senão a arte do esporte; `null` = torneio sem hero. */
  protected readonly cover = computed(() => {
    const t = this.tournament();
    return t ? tournamentCoverOrDefault(t.coverUrl, t.sportId) : null;
  });
  protected readonly shareOpen = signal(false);

  /** Folha "Mais ações" do telefone — encerrar inscrições e cancelar, longe do Compartilhar. */
  protected readonly actionsOpen = signal(false);
  private readonly actionsTrigger = viewChild<ElementRef<HTMLButtonElement>>('actionsTrigger');
  private readonly sheetClose = viewChild<ElementRef<HTMLButtonElement>>('sheetClose');

  /** Mesma regra dos botões do cabeçalho: há o que encerrar/cancelar enquanto o torneio vive. */
  protected readonly hasSheetActions = computed(() => {
    const status = this.tournament()?.status;
    return status === 'inscricoes' || status === 'encerradas' || status === 'andamento';
  });

  protected readonly statusLabel = computed(() => {
    const t = this.tournament();
    return t ? STATUS_LABEL[t.status] : '';
  });

  protected readonly tools = computed<ToolLink[]>(() => {
    const pend = this.pendentesCount();
    return [
      { label: 'Inscrições', icon: 'users', path: 'inscricoes', badge: pend > 0 ? pend : null },
      ...(tournamentUsesUniform(this.tournament())
        ? [{ label: 'Uniformes', icon: 'shirt' as OgIconName, path: 'uniformes', badge: null }]
        : []),
      { label: 'Agendamento', icon: 'calendar', path: 'agendamento', badge: null },
      { label: 'Telão', icon: 'tv', path: 'telao', badge: null },
      { label: 'Transmissão', icon: 'broadcast', path: 'transmissao', badge: null },
      { label: 'Comunicação', icon: 'mail', path: 'comunicacao', badge: null },
      { label: 'Equipe', icon: 'team', path: 'equipe', badge: null },
    ];
  });

  protected readonly shareBases = {
    siteBaseUrl: environment.publicSiteUrl,
    athleteBaseUrl: environment.athleteAppUrl,
  };

  /** Divulgar segue valendo com o torneio rolando (categoria não lotada ainda recebe inscrição);
   *  em concluído/cancelado o link só levaria o atleta a uma porta fechada. */
  protected readonly canShare = computed(() => {
    const status = this.tournament()?.status;
    return status === 'inscricoes' || status === 'encerradas' || status === 'andamento';
  });

  protected readonly sharePlace = computed(() => {
    const t = this.tournament();
    return t ? (t.location ?? t.city) : null;
  });

  protected readonly shareDateLabel = computed(() => {
    const t = this.tournament();
    return t?.startAt ? this.dateRangeLabel(t.startAt, t.endAt) : null;
  });

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const local = t.location ?? t.city ?? 'Local a definir';
    return `Torneio · ${local} · ${this.dateRangeLabel(t.startAt, t.endAt)} · ${STATUS_LABEL[t.status]}`;
  });

  protected readonly inscritosCount = computed(() => this.inscriptions().length);
  protected readonly pendentesCount = computed(() => this.inscriptions().filter((i) => !i.paid).length);
  protected readonly categoriasCount = computed(() => this.tournament()?.categories.length ?? 0);

  protected readonly collected = computed(() => this.tournament()?.collected ?? EMPTY_TOURNAMENT_COLLECTED);

  protected money(cents: number): string {
    return formatCentsShort(cents);
  }

  /** Mesma regra do card na lista de eventos: recorte só quando os dois canais têm valor. O
   *  "a conferir" aparece mesmo sozinho — é uma pendência de ação, não um detalhe. */
  protected readonly collectedSplit = computed<string | null>(() => {
    const c = this.collected();
    const parts: string[] = [];
    if (c.viaAppCents > 0 && c.viaOrganizerCents > 0) {
      parts.push(`${formatCentsShort(c.viaAppCents)} app · ${formatCentsShort(c.viaOrganizerCents)} direto`);
    }
    if (c.toVerifyCents > 0) parts.push(`${formatCentsShort(c.toVerifyCents)} a conferir`);
    return parts.length > 0 ? parts.join(' · ') : null;
  });

  protected readonly categoriaRows = computed<CategoriaRow[]>(() => {
    const t = this.tournament();
    if (!t) return [];
    const insc = this.inscriptions();
    const withMatches = this.categoriesWithMatches();
    return t.categories.map((c) => {
      const rows = insc.filter((i) => i.categoryId === c.id);
      const pagas = rows.filter((r) => r.paid).length;
      return {
        id: c.id,
        name: c.name,
        taken: rows.length,
        total: c.maxTeams,
        pagas,
        pend: rows.length - pagas,
        full: c.maxTeams != null && rows.length >= c.maxTeams,
        unit: c.teamSize != null ? 'equipes' : 'duplas',
        hasMatches: withMatches.has(c.id),
      };
    });
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      this.tournament.set(null);
      this.inscriptions.set([]);
      this.categoriesWithMatches.set(new Set<string>());
      this.coverFailed.set(false);
      this.shareOpen.set(false);
      this.actionsOpen.set(false);
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
      const [tournament, inscriptions, matches] = await Promise.all([getTournament(tid), listInscriptions(tid), listMatches(tid)]);
      this.tournament.set(tournament);
      this.inscriptions.set(inscriptions);
      this.categoriesWithMatches.set(new Set(matches.map((m) => m.categoryId).filter((cid): cid is string => cid != null)));
    } finally {
      this.loading.set(false);
    }
  }

  protected ask(action: PendingAction): void {
    if (this.acting()) return;
    this.actionError.set(null);
    this.pending.set(action);
  }

  protected openActions(): void {
    this.actionsOpen.set(true);
    afterNextRender(() => this.sheetClose()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeActions(): void {
    if (!this.actionsOpen()) return;
    this.actionsOpen.set(false);
    afterNextRender(() => this.actionsTrigger()?.nativeElement.focus(), { injector: this.injector });
  }

  /** A folha fecha antes do diálogo de confirmação abrir — nunca dois modais empilhados. */
  protected askFromSheet(action: 'close' | 'cancel'): void {
    this.actionsOpen.set(false);
    this.ask(action);
  }

  protected dismissPending(): void {
    if (this.acting()) return;
    this.pending.set(null);
    this.actionError.set(null);
  }

  protected confirmCopy(action: PendingAction): { title: string; message: string; confirmLabel: string } {
    return CONFIRM_COPY[action];
  }

  protected confirmPending(action: PendingAction): void {
    if (action === 'close') {
      void this.closeRegistrations();
      return;
    }
    void this.cancel(action === 'cancelPaid');
  }

  private async closeRegistrations(): Promise<void> {
    const t = this.tournament();
    if (!t || this.acting()) return;
    this.acting.set(true);
    this.actingKind.set('close');
    this.feedback.set(null);
    try {
      await closeTournamentRegistrations(t.id);
      this.pending.set(null);
      this.feedback.set({ ok: true, message: 'Inscrições encerradas.' });
      await this.load(t.id);
    } catch (e) {
      this.actionError.set((e as Error).message || 'Falha ao encerrar inscrições.');
    } finally {
      this.acting.set(false);
      this.actingKind.set(null);
    }
  }

  /** `force` = segunda passada, depois que o servidor recusou por haver inscrições pagas. */
  private async cancel(force: boolean): Promise<void> {
    const t = this.tournament();
    if (!t || this.acting()) return;
    this.acting.set(true);
    this.actingKind.set('cancel');
    this.feedback.set(null);
    try {
      await cancelTournament(t.id, force ? { force: true } : undefined);
      this.pending.set(null);
      this.feedback.set({ ok: true, message: 'Torneio cancelado.' });
      await this.load(t.id);
    } catch (e) {
      const err = e as { message?: string; details?: { reason?: string } };
      // Espelha o app: com inscrições pagas o servidor pede confirmação extra (force). Em vez do
      // segundo confirm() nativo que abria em cima do primeiro, o próprio diálogo troca de
      // mensagem — o organizador continua no mesmo lugar, lendo por que subiu a aposta.
      if (!force && isPaidRegistrationsRejection(err)) {
        this.pending.set('cancelPaid');
      } else {
        this.actionError.set(err.message || 'Falha ao cancelar.');
      }
    } finally {
      this.acting.set(false);
      this.actingKind.set(null);
    }
  }

  protected pct(c: CategoriaRow): number {
    if (!c.total) return 0;
    return Math.round((c.taken / c.total) * 100);
  }

  protected dateRangeLabel(start: Date | null, end: Date | null): string {
    if (!start) return 'data a definir';
    if (!end || end.getTime() === start.getTime()) return SHORT_DATE.format(start);
    return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
  }

  protected startAddSponsor(): void {
    this.sponsorName.set('');
    this.sponsorLogoFile.set(null);
    this.sponsorLogoPreview.set(null);
    this.sponsorError.set(null);
    this.addingSponsor.set(true);
  }

  protected cancelAddSponsor(): void {
    if (this.sponsorSaving()) return;
    this.addingSponsor.set(false);
  }

  protected onSponsorNameInput(event: Event): void {
    this.sponsorName.set((event.target as HTMLInputElement).value);
  }

  protected onSponsorLogoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const invalid = validateSponsorLogoFile(file);
    if (invalid) {
      this.sponsorError.set(invalid);
      return;
    }
    this.sponsorError.set(null);
    this.sponsorLogoFile.set(file);
    this.sponsorLogoPreview.set(URL.createObjectURL(file));
  }

  protected async submitSponsor(): Promise<void> {
    const t = this.tournament();
    const file = this.sponsorLogoFile();
    const name = this.sponsorName().trim();
    if (!t || !file || !name || this.sponsorSaving()) return;
    this.sponsorSaving.set(true);
    this.sponsorError.set(null);
    try {
      const sponsor = await addTournamentSponsor(t.id, name, file);
      this.tournament.update((cur) => (cur ? { ...cur, sponsors: [...cur.sponsors, sponsor] } : cur));
      this.addingSponsor.set(false);
    } catch (e) {
      this.sponsorError.set((e as Error).message || 'Falha ao adicionar patrocinador.');
    } finally {
      this.sponsorSaving.set(false);
    }
  }

  protected askRemoveSponsor(sponsor: OrganizerTournamentSponsor): void {
    if (this.sponsorRemoving()) return;
    this.sponsorRemoveError.set(null);
    this.sponsorPendingRemoval.set(sponsor);
  }

  protected async confirmRemoveSponsor(sponsor: OrganizerTournamentSponsor): Promise<void> {
    const t = this.tournament();
    if (!t) return;
    this.sponsorRemoving.set(true);
    this.sponsorRemoveError.set(null);
    try {
      await removeTournamentSponsor(t.id, sponsor.id);
      this.tournament.update((cur) => (cur ? { ...cur, sponsors: cur.sponsors.filter((s) => s.id !== sponsor.id) } : cur));
      this.sponsorPendingRemoval.set(null);
    } catch (e) {
      this.sponsorRemoveError.set((e as Error).message || 'Falha ao remover patrocinador.');
    } finally {
      this.sponsorRemoving.set(false);
    }
  }
}
