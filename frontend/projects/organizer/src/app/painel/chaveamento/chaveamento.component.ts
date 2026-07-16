import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { initialsOf, type PillTone } from '../data/mock-data';
import type { MatchDisplayStatus, TournamentMatch } from '../data/matches-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { type DoubleEliminationBracket, buildDoubleEliminationBracket } from './bracket-tree';
import { ChaveamentoContextService } from './chaveamento-context.service';
import { ChaveamentoSelectorComponent } from './chaveamento-selector.component';
import { ChaveamentoSubnavComponent } from './chaveamento-subnav.component';

interface GenericColumn {
  key: string;
  label: string;
  matches: TournamentMatch[];
}

const STATUS_TONE: Record<MatchDisplayStatus, PillTone> = {
  scheduled: 'orange',
  in_progress: 'red',
  completed: 'green',
  canceled: 'dim',
};

const STATUS_LABEL: Record<MatchDisplayStatus, string> = {
  scheduled: 'Agendado',
  in_progress: 'Ao vivo',
  completed: 'Finalizado',
  canceled: 'Cancelado',
};

/** Quebra o nome da dupla ("Martins / Silva") em até 2 nomes de atleta pro stack de avatares —
 *  mesmo separador que `initialsOf` já usa nas outras telas do organizer (categoria-detalhe,
 *  seeds). Rótulos sem "/" (equipe única, "A definir", "Vencedor Jogo #N") caem no fallback de
 *  1 avatar com o rótulo inteiro, igual já acontecia antes. */
function athleteNamesOf(teamLabel: string): string[] {
  const parts = teamLabel
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.slice(0, 2) : [teamLabel];
}

/** Conta quantos sets cada lado venceu a partir do placar formatado ("2-1, 3-2, …") — mesma
 *  lógica de `PlacarComponent.setsWonA/B`, aqui reaproveitada pro número exibido em cada card
 *  da chave (placar em sets, não o placar de games do set). */
function setsWonOf(score: string): [number, number] {
  let a = 0;
  let b = 0;
  for (const pair of score.split(',')) {
    const [sa, sb] = pair.trim().split('-').map((n) => Number(n) || 0);
    if (sa > sb) a++;
    else if (sb > sa) b++;
  }
  return [a, b];
}

/** Chave de mata-mata da categoria selecionada — dados reais (`listMatches`, Task O6).
 *
 *  Dupla eliminação (`matchType` WB/LB gravado por `category-bracket-builders.ts`) ganha a
 *  árvore completa (`bracket-tree.ts`): chave de vencedores + chave de perdedores lado a lado
 *  em seções, com conectores desenhados a partir dos ponteiros reais de avanço, e banner de
 *  grande final (+ 3º lugar quando a planta tiver disputa de 3º). Eliminatória simples e
 *  grupos+mata-mata (sem ponteiro de avanço salvo — resolvem por posição em runtime, ver
 *  comentário em `bracket-tree.ts`) continuam com o bracket genérico em coluna única.
 *
 *  Card da partida espelha o que o app mostra no card da árvore (`BracketMatchNode`, Flutter):
 *  nº do jogo, selo de status (agendado/ao vivo/finalizado/cancelado), avatar de iniciais por
 *  dupla e placar em sets, card inteiro clicável pro placar — exceto o placar set a set (só o
 *  vencedor exibe, no app), que fica só num clique de distância (`/placar/:id`) em vez de inflar
 *  o card: aqui a altura do card é fixa (ver `BRACKET_MATCH_HEIGHT`) porque os conectores da
 *  árvore são calculados em pixels a partir dela, então uma linha de altura variável quebraria
 *  o alinhamento. Sorteio/exportação de chave continuam mock/fase 2 (operação real fica no app). */
@Component({
  selector: 'og-chaveamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    OgPageHeaderComponent,
    OgIconComponent,
    OgAvatarComponent,
    OgPillComponent,
    ChaveamentoSubnavComponent,
    ChaveamentoSelectorComponent,
  ],
  template: `
    <og-page-header [title]="headerTitle()" [subtitle]="headerSubtitle()">
      @if (seedsLink(); as link) {
        <a class="og-mini-btn" [routerLink]="link"><og-icon name="whistle" [size]="14" />Sortear chave</a>
      }
      <!-- mock (fase 2): exportação de chave (PDF/imagem) ainda não existe no app nem na web -->
      <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="download" [size]="14" />Exportar</button>
    </og-page-header>

    <div class="og-content" style="overflow:auto">
      <og-chaveamento-subnav active="chave" />
      <og-chaveamento-selector />

      <ng-template #cardBody let-m>
        <div class="og-bracket-match-head">
          <span class="og-bracket-match-num">#{{ m.matchNumber || '—' }}</span>
          <og-pill [tone]="statusTone(m)">
            @if (m.status === 'in_progress') {
              <span class="og-dot og-dot-red og-dot-pulse"></span>
            }
            {{ statusLabel(m) }}
          </og-pill>
        </div>
        <div class="og-bracket-side" [class.winner]="m.winnerSide === 1">
          <span class="og-bracket-side-team">
            <span class="og-bracket-avatar-stack">
              @for (name of athleteNames(m.team1Label); track $index; let i = $index) {
                <og-avatar [initials]="initialsOf(name)" [size]="18" [style.margin-left.px]="i ? -8 : 0" [style.z-index]="2 - i" />
              }
            </span>
            <span class="og-bracket-side-name">{{ m.team1Label }}</span>
          </span>
          <span class="og-bracket-side-score">{{ sideScore(m, 1) }}</span>
        </div>
        <div class="og-bracket-side" [class.winner]="m.winnerSide === 2">
          <span class="og-bracket-side-team">
            <span class="og-bracket-avatar-stack">
              @for (name of athleteNames(m.team2Label); track $index; let i = $index) {
                <og-avatar [initials]="initialsOf(name)" [size]="18" [style.margin-left.px]="i ? -8 : 0" [style.z-index]="2 - i" />
              }
            </span>
            <span class="og-bracket-side-name">{{ m.team2Label }}</span>
          </span>
          <span class="og-bracket-side-score">{{ sideScore(m, 2) }}</span>
        </div>
      </ng-template>

      @if (ctx.loadingTournaments() || ctx.loadingMatches()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando chave…</div>
      } @else if (ctx.tournaments().length === 0) {
        <!-- og-chaveamento-selector já mostra "nenhum torneio ainda" -->
      } @else if (!ctx.selectedCategoryId()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Selecione uma categoria acima pra ver a chave.</div>
      } @else if (knockoutMatches().length === 0) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chave ainda não gerada pra esta categoria.</div>
      } @else if (deBracket(); as de) {
        <ng-template #section let-s>
          <div class="og-de-labels-row" [style.width.px]="s.width">
            @for (col of s.columns; track col.key) {
              <div class="og-bracket-round-label og-de-col-label" [style.left.px]="col.left" [style.width.px]="matchWidth">{{ col.label }}</div>
            }
          </div>
          <div class="og-de-canvas" [style.width.px]="s.width" [style.height.px]="s.height">
            <svg class="og-de-lines" [attr.width]="s.width" [attr.height]="s.height">
              @for (c of s.connectors; track $index) {
                <path [attr.d]="c.d" />
              }
            </svg>
            @for (col of s.columns; track col.key) {
              @for (n of col.nodes; track n.match.id) {
                <a
                  class="og-bracket-match og-de-match"
                  [style.left.px]="col.left"
                  [style.top.px]="n.top"
                  [routerLink]="['/painel/chaveamento/placar', n.match.id]"
                >
                  <ng-container [ngTemplateOutlet]="cardBody" [ngTemplateOutletContext]="{ $implicit: n.match }" />
                </a>
              }
            }
          </div>
        </ng-template>

        <div class="og-de-tree">
          <div class="og-de-section-label wb">Chave de vencedores (Winners Bracket)</div>
          <ng-container [ngTemplateOutlet]="section" [ngTemplateOutletContext]="{ $implicit: de.wb }" />

          @if (de.lb) {
            <div class="og-de-divider"></div>
            <div class="og-de-section-label lb">Chave de perdedores (Losers Bracket)</div>
            <ng-container [ngTemplateOutlet]="section" [ngTemplateOutletContext]="{ $implicit: de.lb }" />
          }

          @if (de.grandFinal; as gf) {
            <div class="og-de-final-banner">
              <div class="og-de-final-icon"><og-icon name="trophy" [size]="19" /></div>
              <div style="flex:1;min-width:0">
                <div class="og-de-final-title">Grande final</div>
                <div class="og-de-final-sub">{{ gf.team1Label }} vs {{ gf.team2Label }}</div>
              </div>
              @if (gf.score) {
                <span class="og-de-final-score">{{ gf.score }}</span>
              }
            </div>
          }
          @if (de.thirdPlace; as tp) {
            <div class="og-de-final-banner secondary">
              <div class="og-de-final-icon"><og-icon name="flag" [size]="17" /></div>
              <div style="flex:1;min-width:0">
                <div class="og-de-final-title">Disputa de 3º lugar</div>
                <div class="og-de-final-sub">{{ tp.team1Label }} vs {{ tp.team2Label }}</div>
              </div>
              @if (tp.score) {
                <span class="og-de-final-score">{{ tp.score }}</span>
              }
            </div>
          }
        </div>
      } @else {
        <div class="og-bracket">
          @for (col of genericColumns(); track col.key) {
            <div class="og-bracket-col">
              <div class="og-bracket-round-label">{{ col.label }}</div>
              <div class="og-bracket-matches">
                @for (m of col.matches; track m.id) {
                  <a class="og-bracket-match" [routerLink]="['/painel/chaveamento/placar', m.id]">
                    <ng-container [ngTemplateOutlet]="cardBody" [ngTemplateOutletContext]="{ $implicit: m }" />
                  </a>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ChaveamentoComponent {
  protected readonly ctx = inject(ChaveamentoContextService);
  protected readonly matchWidth = 190;
  protected readonly initialsOf = initialsOf;
  protected readonly athleteNames = athleteNamesOf;

  protected statusTone(m: TournamentMatch): PillTone {
    return STATUS_TONE[m.status];
  }

  protected statusLabel(m: TournamentMatch): string {
    return STATUS_LABEL[m.status];
  }

  protected readonly headerTitle = computed(() => (this.deBracket() ? 'Chaveamento · dupla eliminação' : 'Chaveamento'));

  protected readonly headerSubtitle = computed(() => {
    const t = this.ctx.tournament();
    if (!t) return '';
    const cat = this.ctx.categoryName();
    return cat ? `${t.name} · categoria ${cat}` : t.name;
  });

  /** Partidas de mata-mata da categoria selecionada — exclui fase de grupos (ver GruposComponent, que usa o mesmo rótulo "Grupo "). */
  protected readonly knockoutMatches = computed<TournamentMatch[]>(() => this.ctx.matchesFiltered().filter((m) => !m.round?.startsWith('Grupo ')));

  protected readonly deBracket = computed<DoubleEliminationBracket | null>(() => {
    if (!this.ctx.selectedCategoryId()) return null;
    return buildDoubleEliminationBracket(this.knockoutMatches());
  });

  protected readonly genericColumns = computed<GenericColumn[]>(() => {
    const byLabel = new Map<string, { order: number; matches: TournamentMatch[] }>();
    for (const m of this.knockoutMatches()) {
      const label = m.round ?? 'Rodada';
      const isFinal = m.matchType.trim().toLowerCase() === 'final';
      const order = isFinal ? Number.MAX_SAFE_INTEGER : m.roundNumber;
      const entry = byLabel.get(label) ?? { order, matches: [] };
      entry.matches.push(m);
      byLabel.set(label, entry);
    }
    return [...byLabel.entries()]
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([label, { matches }]) => ({ key: label, label, matches: [...matches].sort((a, b) => a.matchNumber - b.matchNumber) }));
  });

  protected sideScore(m: TournamentMatch, side: 1 | 2): number | string {
    if (!m.score) return '–';
    const [a, b] = setsWonOf(m.score);
    return side === 1 ? a : b;
  }
}
