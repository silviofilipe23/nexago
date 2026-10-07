import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  interviewOnAirAt,
  type BroadcastFinalMode,
  type BroadcastGraphicId,
  type BroadcastGraphics,
  type KocRoundEndScreen,
} from '../data/broadcast-control';
import type { BroadcastControlPatch } from '../data/broadcast-control-repository';
import { resolveCourtNames } from '../data/matches-repository';
import { categoryFinalOf } from '../../publico/overlay/overlay-final';
import { TransmissaoDataService } from './transmissao-data.service';
import { TransmissaoEventosComponent } from './transmissao-eventos.component';
import { TransmissaoEntrevistaComponent } from './transmissao-entrevista.component';
import { TransmissaoGradeComponent } from './transmissao-grade.component';
import { TransmissaoChaveComponent } from './transmissao-chave.component';
import { TransmissaoGrupoComponent } from './transmissao-grupo.component';
import { txAtalhoOf, txGroupsOf, txIndexOfAtalho, txItemsOf, type TxItem, type TxItemKey } from './transmissao-itens';
import { TransmissaoIntervaloComponent } from './transmissao-intervalo.component';
import { TransmissaoMultiComponent } from './transmissao-multi.component';
import { TransmissaoPrejogoComponent } from './transmissao-prejogo.component';
import { TransmissaoRankingComponent } from './transmissao-ranking.component';
import { courtChipsOf, transmissaoUrl } from './transmissao-selectors';

const ROUND_END_OPTIONS: readonly { value: KocRoundEndScreen; label: string }[] = [
  { value: 'rodizio', label: 'Rodízio' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'classificadas', label: 'Classificadas' },
];

const FINAL_OPTIONS: readonly { value: BroadcastFinalMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'Ligado' },
  { value: 'off', label: 'Desligado' },
];

/** Onde cada gráfico aparece na tela de 1920×1080 — só o esquema da prévia. */
const PREVIEW_SPOT: Record<TxItemKey, { label: string; spot: string }> = {
  scoreboard: { label: 'Placar', spot: 'bl' },
  decisivo: { label: 'MOMENTO DECISIVO', spot: 'bc' },
  sponsors: { label: 'Oferecimento', spot: 'tr' },
  donation: { label: 'Doação PIX', spot: 'r' },
  champions: { label: 'Campeões', spot: 'tc' },
  interview: { label: 'Entrevista', spot: 'bc' },
  prejogo: { label: 'Pré-jogo', spot: 'c' },
  summary: { label: 'Resumo', spot: 'c' },
  ranking: { label: 'Ranking Top 10', spot: 'full' },
  grade: { label: 'Grade do dia', spot: 'full' },
  intervalo: { label: 'INTERVALO', spot: 'full' },
  grupo: { label: 'TABELA DO GRUPO', spot: 'c' },
  chave: { label: 'CHAVES', spot: 'full' },
  eventos: { label: 'PRÓXIMOS EVENTOS', spot: 'full' },
  multi: { label: 'Multi-quadras', spot: 'full' },
  kocBar: { label: 'Faixa da rodada', spot: 'strip' },
  kocPreRound: { label: 'Próximos em quadra', spot: 'c' },
  kocRoundEnd: { label: 'Fim de rodada', spot: 'c' },
};

function typingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** `eventos/:id/transmissao` — controla o que o overlay do OBS mostra (`/transmissao/:id`).
 *  Cada clique grava na hora em `tournaments/{id}/broadcast/control`; a tela escuta o mesmo doc,
 *  então dois operadores veem o mesmo estado e uma escrita recusada volta sozinha. */
@Component({
  selector: 'og-transmissao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TransmissaoDataService],
  host: { '(document:keydown)': 'onKey($event)' },
  imports: [TransmissaoEntrevistaComponent, TransmissaoPrejogoComponent, TransmissaoRankingComponent, TransmissaoMultiComponent, TransmissaoGradeComponent, TransmissaoIntervaloComponent, TransmissaoGrupoComponent, TransmissaoChaveComponent, TransmissaoEventosComponent, RouterLink],
  template: `
    <div class="og-tx-page">
      <header class="og-tx-bar">
        <div class="og-tx-bar-title">
          <h1>Transmissão</h1>
          <span class="og-tx-live">AO VIVO</span>
        </div>
        <div class="og-tx-obs">
          <code class="og-tx-url" [attr.title]="url()">{{ url() }}</code>
          <button type="button" class="og-ghost-btn" (click)="copyUrl()">{{ copied() ? 'Copiado ✓' : 'Copiar' }}</button>
          <button
            type="button"
            class="og-tx-help"
            aria-label="Como usar no OBS"
            [attr.aria-expanded]="helpOpen()"
            [attr.title]="helpText"
            (click)="helpOpen.set(!helpOpen())"
          >
            ?
          </button>
          @if (helpOpen()) {
            <div class="og-tx-help-pop" role="note">{{ helpText }}</div>
          }
        </div>
        <div class="og-tx-courts" role="radiogroup" aria-label="Quadra transmitida">
          @for (c of courtChips(); track c.id) {
            <button
              type="button"
              class="og-tx-court"
              role="radio"
              [class.active]="c.id === svc.control().courtId"
              [attr.aria-checked]="c.id === svc.control().courtId"
              [attr.title]="c.status"
              (click)="selectCourt(c.id)"
            >
              <span class="og-tx-court-name">{{ c.name }}</span>
              <span class="og-tx-court-status" [class.live]="c.live">{{ c.status }}</span>
            </button>
          } @empty {
            <span class="og-tx-dica">Este torneio ainda não tem quadras cadastradas.</span>
          }
        </div>
      </header>

      @if (svc.saveError()) {
        <p class="og-tx-erro" role="alert">Não deu pra salvar a última mudança — confira a conexão e tente de novo.</p>
      }

      <div class="og-tx-grid">
        <section class="og-tx-panel og-tx-lista" aria-label="Gráficos">
          <div class="og-tx-panel-head">
            <h2>Gráficos</h2>
            <span class="og-tx-count" [class.on]="noAr() > 0">{{ noAr() }} NO AR</span>
          </div>
          <div class="og-tx-panel-body">
            @for (g of groups(); track g.label) {
              <div class="og-tx-grupo">{{ g.label }}</div>
              @for (item of g.itens; track item.key) {
                <div class="og-tx-row" [class.sel]="item.key === selectedKey()" [class.warn]="item.warn && item.locked">
                  <span class="og-tx-dot" [class.on]="item.on && !item.auto" aria-hidden="true"></span>
                  <button type="button" class="og-tx-row-main" [attr.aria-current]="item.key === selectedKey()" (click)="select(item.key)">
                    <span class="og-tx-row-nome">
                      {{ item.nome }}
                      @if (atalho(item.key); as k) {
                        <kbd>{{ k }}</kbd>
                      }
                    </span>
                    <span class="og-tx-row-resumo" [class.warn]="item.warn">{{ item.resumo }}</span>
                  </button>
                  @if (item.agora) {
                    <button
                      type="button"
                      class="og-mini-btn og-tx-agora"
                      [disabled]="agoraDisabled(item)"
                      [attr.title]="agoraTitle(item.key)"
                      (click)="showNow(item.key)"
                    >
                      Agora
                    </button>
                  }
                  <button
                    type="button"
                    class="og-toggle og-tx-sw"
                    role="switch"
                    [class.on]="item.on"
                    [attr.aria-checked]="item.on"
                    [attr.aria-label]="item.nome"
                    [disabled]="item.locked"
                    (click)="toggleItem(item.key)"
                  ></button>
                </div>
              }
            }
          </div>
        </section>

        <section class="og-tx-panel og-tx-cfg" aria-label="Configurações">
          <div class="og-tx-panel-head">
            <h2>{{ selected().nome }}</h2>
            <span class="og-tx-cfg-noar">No ar</span>
            <button
              type="button"
              class="og-toggle og-tx-sw"
              role="switch"
              [class.on]="selected().on"
              [attr.aria-checked]="selected().on"
              [attr.aria-label]="selected().nome + ' no ar'"
              [disabled]="selected().locked"
              (click)="toggleItem(selected().key)"
            ></button>
          </div>
          <div class="og-tx-panel-body og-tx-cfg-body">
            @if (selected().locked && selected().warn) {
              <p class="og-tx-aviso">Monte o card primeiro — o botão "No ar" só libera depois.</p>
            }
            <og-tx-entrevista [bare]="true" [hidden]="selectedKey() !== 'interview'" />
            <og-tx-prejogo [bare]="true" [hidden]="selectedKey() !== 'prejogo'" />
            <og-tx-ranking [bare]="true" [hidden]="selectedKey() !== 'ranking'" />
            <og-tx-multi [bare]="true" [hidden]="selectedKey() !== 'multi'" />
            <og-tx-grade [bare]="true" [hidden]="selectedKey() !== 'grade'" />
            <og-tx-intervalo [bare]="true" [hidden]="selectedKey() !== 'intervalo'" />
            <og-tx-grupo [bare]="true" [hidden]="selectedKey() !== 'grupo'" />
            <og-tx-chave [bare]="true" [hidden]="selectedKey() !== 'chave'" />
            <og-tx-eventos [bare]="true" [hidden]="selectedKey() !== 'eventos'" />

            @switch (selectedKey()) {
              @case ('scoreboard') {
                <p class="og-tx-dica">O placar da partida da quadra transmitida, no canto inferior esquerdo. Troque a quadra na barra de cima.</p>
              }
              @case ('decisivo') {
                <p class="og-tx-dica">Alerta que entra sozinho, no centro de baixo, quando a partida da quadra transmitida chega a set point, match point ou tie-break (e some quando passa). Desligue aqui se não quiser o alerta.</p>
              }
              @case ('summary') {
                <p class="og-tx-dica">Estatísticas e fluxo do jogo. Ao fim da partida entra sozinho; ligado no meio do jogo vira "Resumo parcial".</p>
              }
              @case ('champions') {
                <div class="og-tx-cfg-grid">
                  <div>
                    <div class="og-tx-label">Visual Grande final</div>
                    <div class="og-tx-chips">
                      @for (o of finalOptions; track o.value) {
                        <button type="button" class="og-chip" [class.active]="svc.control().finalMode === o.value" (click)="setFinalMode(o.value)">
                          {{ o.label }}
                        </button>
                      }
                    </div>
                  </div>
                  <div>
                    <div class="og-tx-label">Categoria do pódio</div>
                    <div class="og-tx-chips" role="radiogroup" aria-label="Categoria do pódio">
                      @for (o of podiumOptions(); track o.id) {
                        <button
                          type="button"
                          class="og-chip"
                          role="radio"
                          [class.active]="svc.control().championsCategoryId === o.id"
                          [attr.aria-checked]="svc.control().championsCategoryId === o.id"
                          (click)="setPodiumCategory(o.id)"
                        >
                          {{ o.label }}
                        </button>
                      }
                    </div>
                  </div>
                </div>
                <p class="og-tx-dica og-tx-podio">{{ podiumStatus() }}</p>
              }
              @case ('sponsors') {
                <p class="og-tx-dica">Card "Oferecimento" em ciclo no topo da tela. "Agora" mostra na hora, sem esperar o ciclo.</p>
                @if (semPatrocinador()) {
                  <p class="og-tx-aviso">
                    <span>Nenhum patrocinador cadastrado —</span>
                    <a [routerLink]="['/eventos', id()]">cadastrar na página do torneio</a>
                  </p>
                }
                <button
                  type="button"
                  class="og-mini-btn og-tx-agora-cfg"
                  [disabled]="!svc.control().graphics.sponsors || onAir() != null || semPatrocinador()"
                  [attr.title]="agoraTitle('sponsors')"
                  (click)="showNow('sponsors')"
                >
                  Mostrar agora
                </button>
              }
              @case ('donation') {
                <p class="og-tx-dica">QR de doação no canto da tela, em ciclo. "Agora" mostra na hora, sem esperar o ciclo.</p>
                <button
                  type="button"
                  class="og-mini-btn og-tx-agora-cfg"
                  [disabled]="!svc.control().graphics.donation || onAir() != null"
                  [attr.title]="agoraTitle('donation')"
                  (click)="showNow('donation')"
                >
                  Mostrar agora
                </button>
              }
              @case ('kocBar') {
                <p class="og-tx-dica">Rei, desafiante, fila e cronômetro no rodapé da tela.</p>
              }
              @case ('kocPreRound') {
                <p class="og-tx-dica">Elenco da rodada antes do apito.</p>
              }
              @case ('kocRoundEnd') {
                <p class="og-tx-dica">Classificação da rodada e classificadas da fase.</p>
              }
            }

            @if (isKoc()) {
              <div class="og-tx-label">Tela do fim de rodada</div>
              <div class="og-tx-chips">
                @for (o of roundEndOptions; track o.value) {
                  <button type="button" class="og-chip" [class.active]="svc.control().kocRoundEndScreen === o.value" (click)="setRoundEndScreen(o.value)">
                    {{ o.label }}
                  </button>
                }
              </div>
            }
          </div>
        </section>

        <section class="og-tx-panel og-tx-noar" aria-label="No ar">
          <div class="og-tx-panel-head">
            <h2>No ar</h2>
          </div>
          <div class="og-tx-panel-body">
            <div class="og-tx-preview" role="img" aria-label="Esquema do que está no ar">
              @for (b of previewBoxes(); track b.key) {
                <div class="og-tx-pv" [class]="'og-tx-pv og-tx-pv-' + b.spot">{{ b.label }}</div>
              }
              <span class="og-tx-pv-mark" aria-hidden="true">N</span>
            </div>
            <div class="og-tx-grupo">Ativos agora</div>
            <div class="og-tx-ativos">
              @for (item of ativos(); track item.key) {
                <span class="og-tx-ativo">
                  {{ item.nome }}
                  <button type="button" [attr.aria-label]="'Tirar ' + item.nome + ' do ar'" (click)="toggleItem(item.key)">×</button>
                </span>
              } @empty {
                <span class="og-tx-dica">Nada no ar.</span>
              }
            </div>
            <ul class="og-tx-atalhos" aria-label="Atalhos">
              <li><kbd>1–9</kbd> <kbd>A–Z</kbd> Liga/desliga o gráfico da lista (letras a partir do 10º)</li>
              <li><kbd>↑ ↓</kbd> Navega entre gráficos</li>
              <li><kbd>Esc</kbd> Tira tudo do ar, menos o placar</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `
    .og-tx-page {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px 20px 16px;
      overflow: hidden;
    }
    .og-tx-bar {
      flex: none;
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
    }
    .og-tx-bar-title {
      flex: none;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .og-tx-bar-title h1 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 18px;
      font-weight: 700;
    }
    .og-tx-live {
      padding: 2px 8px;
      border-radius: var(--nx-r-pill, 999px);
      background: var(--nx-live, #ff3b30);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .og-tx-obs {
      position: relative;
      flex: 0 1 380px;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .og-tx-url {
      flex: 1;
      min-width: 0;
      padding: 7px 10px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-tx-help {
      flex: none;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      color: var(--nx-text-dim);
      font-weight: 700;
      cursor: pointer;
    }
    .og-tx-help-pop {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 5;
      width: 280px;
      padding: 10px 12px;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-2);
      font-size: 12.5px;
      line-height: 1.4;
    }
    .og-tx-courts {
      flex: 1;
      min-width: 0;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .og-tx-court {
      flex: none;
      max-width: 210px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      padding: 6px 12px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
    }
    .og-tx-court.active {
      border-color: var(--nx-orange-500);
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange, #fff);
    }
    .og-tx-court-name {
      font-size: 13px;
      font-weight: 700;
    }
    .og-tx-court-status {
      max-width: 100%;
      font-size: 11px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-tx-court.active .og-tx-court-status {
      color: inherit;
      opacity: 0.85;
    }
    .og-tx-court-status.live {
      color: var(--nx-live, #ff3b30);
    }
    .og-tx-court.active .og-tx-court-status.live {
      color: inherit;
    }
    .og-tx-erro {
      flex: none;
      margin: 0;
      padding: 8px 14px;
      border-radius: var(--nx-r-3);
      background: rgba(255, 59, 48, 0.12);
      color: var(--nx-live, #ff3b30);
      font-size: 14px;
    }

    .og-tx-grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 340px minmax(0, 1fr) 380px;
      grid-template-rows: minmax(0, 1fr);
      gap: 12px;
    }
    .og-tx-panel {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
    }
    .og-tx-panel-head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-tx-panel-head h2 {
      flex: 1;
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 14px;
      font-weight: 700;
    }
    .og-tx-panel-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 10px 14px 14px;
    }
    .og-tx-count {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--nx-text-dim);
    }
    .og-tx-count.on {
      color: var(--nx-live, #ff3b30);
    }
    .og-tx-cfg-noar {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-tx-grupo,
    .og-tx-label {
      margin: 12px 0 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-tx-grupo:first-child {
      margin-top: 2px;
    }
    .og-tx-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border: 1px solid transparent;
      border-radius: var(--nx-r-2);
    }
    .og-tx-row.sel {
      border-color: var(--nx-orange-500);
      background: var(--nx-surface-1);
    }
    .og-tx-row.warn {
      background: rgba(255, 196, 0, 0.08);
    }
    .og-tx-dot {
      flex: none;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-line-strong);
    }
    .og-tx-dot.on {
      background: var(--nx-live, #ff3b30);
    }
    .og-tx-row-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
    }
    .og-tx-row-nome {
      font-size: 13.5px;
      font-weight: 600;
    }
    .og-tx-row-nome kbd,
    .og-tx-atalhos kbd {
      margin-left: 6px;
      padding: 0 5px;
      border: 1px solid var(--nx-line-strong);
      border-radius: 4px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-tx-row-resumo {
      max-width: 100%;
      font-size: 9px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-tx-row-resumo.warn,
    .og-tx-aviso {
      color: #ffc400;
    }
    .og-tx-aviso {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 0 0 10px;
      font-size: 13px;
    }
    .og-tx-aviso a {
      color: inherit;
      text-decoration: underline;
    }
    .og-tx-sw:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .og-tx-dica {
      margin: 6px 0 10px;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-tx-podio {
      margin: 10px 0 0;
    }
    .og-tx-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-tx-cfg-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0 20px;
    }
    .og-tx-cfg-body > * {
      display: block;
    }
    .og-tx-cfg-body > [hidden] {
      display: none;
    }

    .og-tx-preview {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      border-radius: var(--nx-r-2);
      overflow: hidden;
      background: #000;
      background-image: linear-gradient(135deg, #15151a, #050507);
    }
    .og-tx-pv {
      position: absolute;
      z-index: 2;
      padding: 3px 8px;
      border: 1px solid var(--nx-orange-500);
      border-radius: 4px;
      background: rgba(255, 106, 26, 0.22);
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }
    .og-tx-pv-bl { left: 4%; bottom: 6%; }
    .og-tx-pv-tr { right: 4%; top: 6%; }
    .og-tx-pv-r { right: 4%; top: 42%; }
    .og-tx-pv-tc { left: 50%; top: 6%; transform: translateX(-50%); }
    .og-tx-pv-bc { left: 50%; bottom: 6%; transform: translateX(-50%); }
    .og-tx-pv-c { left: 50%; top: 50%; transform: translate(-50%, -50%); }
    .og-tx-pv-strip { left: 2%; right: 2%; bottom: 2%; text-align: center; }
    .og-tx-pv-full { inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center; border-radius: 0; background: rgba(255, 106, 26, 0.35); }
    .og-tx-pv-mark {
      position: absolute;
      z-index: 3;
      right: 3%;
      bottom: 4%;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      line-height: 18px;
      text-align: center;
    }
    .og-tx-ativos {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .og-tx-ativo {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 4px 3px 10px;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-pill, 999px);
      background: var(--nx-surface-1);
      font-size: 12px;
      font-weight: 600;
    }
    .og-tx-ativo button {
      width: 20px;
      height: 20px;
      border: 0;
      border-radius: 50%;
      background: var(--nx-surface-2);
      color: var(--nx-text);
      cursor: pointer;
      line-height: 1;
    }
    .og-tx-atalhos {
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-tx-atalhos li {
      margin-bottom: 4px;
    }
    .og-tx-atalhos kbd {
      margin: 0 6px 0 0;
    }

    @media (max-width: 1279.98px) {
      .og-tx-grid {
        grid-template-columns: 280px minmax(0, 1fr) 300px;
      }
      .og-tx-obs {
        flex-basis: 260px;
      }
    }
    @media (min-width: 1280px) {
      .og-tx-cfg-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    @media (max-width: 1099.98px) {
      .og-tx-page {
        overflow-y: auto;
      }
      .og-tx-bar {
        flex-wrap: wrap;
      }
      .og-tx-courts {
        flex-basis: 100%;
        justify-content: flex-start;
      }
      .og-tx-grid {
        flex: none;
        grid-template-columns: 280px minmax(0, 1fr);
        grid-template-rows: none;
      }
      .og-tx-panel {
        min-height: 360px;
        max-height: 70vh;
      }
      .og-tx-noar {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class TransmissaoComponent {
  protected readonly svc = inject(TransmissaoDataService);

  /** Preenchido pelo router (`withComponentInputBinding`) a partir de `eventos/:id/transmissao`. */
  readonly id = input.required<string>();

  protected readonly roundEndOptions = ROUND_END_OPTIONS;
  protected readonly finalOptions = FINAL_OPTIONS;
  protected readonly helpText = 'No OBS: Fontes → Navegador, 1920×1080, cole o link. Ele acompanha a quadra escolhida aqui.';

  /** Relógio de 1 s: status das quadras e tarja no ar. */
  private readonly now = signal(Date.now());
  protected readonly copied = signal(false);
  protected readonly helpOpen = signal(false);
  /** `null` = o primeiro item da lista (Placar). */
  protected readonly selectedKey = computed<TxItemKey>(() => {
    const k = this.picked();
    return k && this.items().some((i) => i.key === k) ? k : (this.items()[0]?.key ?? 'scoreboard');
  });
  private readonly picked = signal<TxItemKey | null>(null);

  protected readonly url = computed(() => transmissaoUrl(location.origin, this.id()));

  /** Jogo do auto-agendamento antigo só gravou `courtId` — o nome sai das quadras do torneio. */
  private readonly matches = computed(() => resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []));

  protected readonly courtChips = computed(() => courtChipsOf(this.svc.tournament()?.courts ?? [], this.matches(), this.now()));

  /** A tarja que está no ar agora (o relógio expira a de duração fixa). */
  protected readonly onAir = computed(() => {
    const i = this.svc.control().interview;
    return interviewOnAirAt(i, this.now()) ? i : null;
  });

  protected readonly groups = computed(() =>
    txGroupsOf({
      control: this.svc.control(),
      tournament: this.svc.tournament(),
      matches: this.svc.matches(),
      queue: this.svc.queue(),
      interview: this.onAir(),
    }),
  );
  private readonly items = computed(() => txItemsOf(this.groups()));
  protected readonly selected = computed<TxItem>(() => this.items().find((i) => i.key === this.selectedKey()) ?? this.items()[0]);
  protected readonly ativos = computed(() => this.items().filter((i) => i.on && !i.auto));
  protected readonly noAr = computed(() => this.ativos().length);
  protected readonly isKoc = computed(() => this.selectedKey().startsWith('koc'));

  /** Esquema da prévia: uma caixa por gráfico no ar, na posição aproximada da tela. */
  protected readonly previewBoxes = computed(() =>
    this.ativos().map((i) => {
      const p = PREVIEW_SPOT[i.key];
      const strip =
        (i.key === 'multi' && this.svc.control().multi.mode === 'strip') || (i.key === 'eventos' && this.svc.control().eventos.mode === 'strip');
      return { key: i.key, label: p.label, spot: strip ? 'strip' : p.spot };
    }),
  );

  /** "Automático" (null) e cada categoria do torneio, na ordem cadastrada. */
  protected readonly podiumOptions = computed<{ id: string | null; label: string }[]>(() => [
    { id: null, label: 'Automático' },
    ...(this.svc.tournament()?.categories ?? []).map((c) => ({ id: c.id, label: c.name })),
  ]);

  /** O que a escolha põe no ar — escolher uma categoria cuja final não acabou não mostra nada, e
   *  o operador precisa saber disso antes de procurar defeito no OBS. */
  protected readonly podiumStatus = computed(() => {
    const id = this.svc.control().championsCategoryId;
    if (!id) return 'Segue a final que termina na quadra transmitida.';
    const nome = this.svc.tournament()?.categories.find((c) => c.id === id)?.name ?? 'esta categoria';
    return categoryFinalOf(this.svc.matches(), id)
      ? `Pódio de ${nome} no ar (com a chave Campeões ligada), em qualquer quadra.`
      : `A final de ${nome} ainda não terminou — o pódio entra quando ela acabar.`;
  });

  /** O card "Oferecimento" só tem o que mostrar com patrocinador cadastrado no torneio — sem
   *  isso o "Mostrar agora" gravava o comando e o ar não mudava, sem explicar por quê. */
  protected readonly semPatrocinador = computed(() => (this.svc.tournament()?.sponsors ?? []).length === 0);

  constructor() {
    effect(() => this.svc.tournamentId.set(this.id()));
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Atalho mostrado na linha: 1–9 e, passando do 9º item, A, B, C… */
  protected atalho(key: TxItemKey): string | null {
    const i = this.items().findIndex((x) => x.key === key);
    return i < 0 ? null : txAtalhoOf(i);
  }

  protected agoraDisabled(item: TxItem): boolean {
    return !item.on || this.onAir() != null || (item.key === 'sponsors' && this.semPatrocinador());
  }

  protected agoraTitle(id: TxItemKey): string | null {
    if (this.onAir()) return 'A tarja está no ar — tire a tarja pra mostrar';
    if (id === 'sponsors' && this.semPatrocinador()) return 'Cadastre patrocinadores na página do torneio';
    return null;
  }

  protected select(key: TxItemKey): void {
    this.picked.set(key);
  }

  protected selectCourt(courtId: string): void {
    void this.svc.save({ courtId });
  }

  /** Liga/desliga a linha. Travada (sem card / sem tarja) só desliga o que já está no ar. */
  protected toggleItem(key: TxItemKey): void {
    const c = this.svc.control();
    switch (key) {
      case 'multi':
        void this.svc.save({ multi: { ...c.multi, on: !c.multi.on } });
        break;
      case 'prejogo':
        if (c.prejogo.card || c.prejogo.on) void this.svc.save({ prejogo: { ...c.prejogo, on: !c.prejogo.on } });
        break;
      case 'ranking':
        if (c.ranking.card || c.ranking.on) void this.svc.save({ ranking: { ...c.ranking, on: !c.ranking.on } });
        break;
      case 'grade':
        void this.svc.save({ grade: { ...c.grade, on: !c.grade.on } });
        break;
      case 'intervalo':
        void this.svc.save({ intervalo: { ...c.intervalo, on: !c.intervalo.on } });
        break;
      case 'grupo':
        void this.svc.save({ grupo: { ...c.grupo, on: !c.grupo.on } });
        break;
      case 'chave':
        void this.svc.save({ chave: { ...c.chave, on: !c.chave.on } });
        break;
      case 'eventos':
        if (c.eventos.card || c.eventos.on) void this.svc.save({ eventos: { ...c.eventos, on: !c.eventos.on } });
        break;
      case 'interview':
        // A tarja só sobe pelo card de Entrevista (precisa de entrevistado): aqui só se tira.
        if (this.onAir()) void this.svc.saveAir(null, null);
        break;
      case 'summary':
        void this.svc.save({ summaryOn: !c.summaryOn });
        break;
      default: {
        const graphics: Partial<BroadcastGraphics> = {};
        graphics[key] = !c.graphics[key];
        void this.svc.save({ graphics });
      }
    }
  }

  /** Esc: tira tudo do ar, menos o placar — numa escrita só (a tarja tem a sua). */
  protected clearAll(): void {
    const c = this.svc.control();
    const graphics: Partial<BroadcastGraphics> = {};
    for (const item of this.items()) {
      if (item.key !== 'scoreboard' && item.key !== 'decisivo' && item.key in c.graphics) graphics[item.key as BroadcastGraphicId] = false;
    }
    const patch: BroadcastControlPatch = {
      graphics,
      multi: { ...c.multi, on: false },
      prejogo: { ...c.prejogo, on: false },
      ranking: { ...c.ranking, on: false },
      grade: { ...c.grade, on: false },
      intervalo: { ...c.intervalo, on: false },
      grupo: { ...c.grupo, on: false },
      chave: { ...c.chave, on: false },
      eventos: { ...c.eventos, on: false },
      summaryOn: false,
    };
    void this.svc.save(patch);
    if (this.onAir()) void this.svc.saveAir(null, null);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented || typingTarget(e.target)) return;
    const items = this.items();
    if (e.key === 'Escape') {
      if (this.helpOpen()) this.helpOpen.set(false);
      else this.clearAll();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const i = items.findIndex((x) => x.key === this.selectedKey());
      const next = items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) this.select(next.key);
    } else if (txIndexOfAtalho(e.key) != null) {
      const item = items[txIndexOfAtalho(e.key)!];
      if (!item || item.locked) return;
      this.toggleItem(item.key);
    } else {
      return;
    }
    e.preventDefault();
  }

  protected showNow(id: TxItemKey): void {
    const at = Date.now();
    void this.svc.save({ commands: id === 'donation' ? { donationNowAt: at } : { sponsorsNowAt: at } });
  }

  protected setRoundEndScreen(kocRoundEndScreen: KocRoundEndScreen): void {
    void this.svc.save({ kocRoundEndScreen });
  }

  protected setFinalMode(finalMode: BroadcastFinalMode): void {
    void this.svc.save({ finalMode });
  }

  protected setPodiumCategory(championsCategoryId: string | null): void {
    void this.svc.save({ championsCategoryId });
  }

  protected copyUrl(): void {
    void navigator.clipboard.writeText(this.url()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
