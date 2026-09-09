import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import {
  destinationLabelOf,
  preassignedCountOf,
  revealOriginLabelOf,
} from '../painel/data/draw-session-selectors';
import { DrawSessionStore } from '../painel/sorteio/draw-session.store';

/**
 * `/sorteio/:sessionId/comprovante` — a sequência completa do sorteio, pública.
 *
 * É o link que o organizador manda no grupo quando alguém reclama. Traz cada
 * revelação na ordem, com horário do servidor e o hash encadeado: adulterar,
 * reordenar ou remover qualquer linha quebra a cadeia daí pra frente, e isso
 * fica visível aqui.
 *
 * O comprovante de uma sessão ANULADA continua público, com o motivo escrito.
 * É justamente o que impede sortear até dar certo em silêncio — uma anulação
 * apagada não seria prova de nada.
 */
@Component({
  selector: 'og-sorteio-comprovante',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DrawSessionStore],
  imports: [DatePipe],
  template: `
    <div class="og-comp">
      @if (store.session(); as s) {
        <header class="og-comp-head">
          <span class="og-comp-kicker">Comprovante do sorteio</span>
          <h1>{{ s.tournamentName }}</h1>
          <p class="og-comp-sub">
            {{ s.categoryName }} ·
            {{ s.format === 'groups_knockout' ? 'fase de grupos' : 'dupla eliminatória' }} ·
            {{ s.entrants.length }} duplas
          </p>

          <div class="og-comp-selo" [class.anulada]="s.status === 'voided'">
            @switch (s.status) {
              @case ('published') {
                Chave publicada
              }
              @case ('voided') {
                Sessão anulada
              }
              @case ('live') {
                Sorteio em andamento
              }
              @default {
                Sorteio ainda não começou
              }
            }
          </div>

          @if (s.status === 'voided' && s.voidReason) {
            <p class="og-comp-motivo"><strong>Motivo da anulação:</strong> {{ s.voidReason }}</p>
          }
        </header>

        <section class="og-comp-meta">
          <div>
            <span class="og-comp-kicker">Início</span>
            <span class="og-comp-meta-valor">{{
              s.startedAt ? (s.startedAt | date: "dd/MM/yyyy 'às' HH:mm:ss") : '—'
            }}</span>
          </div>
          <div>
            <span class="og-comp-kicker">Revelações</span>
            <span class="og-comp-meta-valor">{{ s.reveals.length }} de {{ s.totalReveals }}</span>
          </div>
          <div>
            <span class="og-comp-kicker">Âncora da cadeia</span>
            <span class="og-comp-meta-valor og-comp-hash">{{ shortHash(s.genesisHash) }}</span>
          </div>
        </section>

        <p class="og-comp-explica">
          Cada revelação foi gravada no servidor com o hash da anterior. Reordenar, alterar ou
          remover qualquer linha quebra a cadeia a partir dela.
          @if (preassignedCount() > 0) {
            <strong class="og-comp-ressalva">
              {{ preassignedCount() }} {{ preassignedCount() === 1 ? 'linha' : 'linhas' }} não
              {{ preassignedCount() === 1 ? 'foi sorteada' : 'foram sorteadas' }}: as cabeças de
              chave entram no grupo que o ranking já define, e estão marcadas como
              &ldquo;por ranking&rdquo;.
            </strong>
            As demais saíram de aleatoriedade criptográfica.
          } @else {
            Todas foram sorteadas com aleatoriedade criptográfica.
          }
        </p>

        <ol class="og-comp-lista">
          @for (reveal of rows(); track reveal.index) {
            <li class="og-comp-linha">
              <span class="og-comp-num">#{{ padded(reveal.index) }}</span>
              <span class="og-comp-dupla">{{ reveal.label }}</span>
              <span class="og-comp-destino">{{ reveal.destination }}</span>
              <span class="og-comp-hora">{{ reveal.atMillis | date: 'HH:mm:ss' }}</span>
              <span class="og-comp-hash">{{ shortHash(reveal.hash) }}</span>
              @if (reveal.preassigned) {
                <span
                  class="og-comp-origem"
                  title="Cabeça de chave: o grupo já era definido pelo ranking, não foi sorteado"
                >
                  {{ reveal.origin }}
                </span>
              }
              @if (reveal.relaxed.length > 0) {
                <span class="og-comp-relaxed" title="Restrição relaxada nesta revelação">
                  {{ relaxedLabel(reveal.relaxed) }}
                </span>
              }
            </li>
          }
          @empty {
            <li class="og-comp-vazio">Nenhuma revelação registrada.</li>
          }
        </ol>
      } @else if (store.loading()) {
        <p class="og-comp-estado">Carregando o comprovante…</p>
      } @else if (store.notFound()) {
        <p class="og-comp-estado">Comprovante não encontrado. Confira o link com a organização.</p>
      } @else {
        <p class="og-comp-estado">Não foi possível carregar. Verifique a conexão.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--nx-bg);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }
    .og-comp {
      max-width: 880px;
      margin: 0 auto;
      padding: 40px 20px 64px;
    }
    .og-comp-kicker {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-comp-head h1 {
      margin: 8px 0 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.02em;
    }
    .og-comp-sub {
      margin: 6px 0 0;
      color: var(--nx-text-mute);
      font-size: 15px;
    }
    .og-comp-selo {
      display: inline-block;
      margin-top: 16px;
      padding: 7px 16px;
      border-radius: 999px;
      background: rgb(43 209 126 / 16%);
      border: 1px solid rgb(43 209 126 / 45%);
      color: var(--nx-win);
      font-family: var(--nx-font-mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .og-comp-selo.anulada {
      background: rgb(255 59 48 / 14%);
      border-color: rgb(255 59 48 / 45%);
      color: var(--nx-live);
    }
    .og-comp-motivo {
      margin: 14px 0 0;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgb(255 59 48 / 8%);
      border: 1px solid rgb(255 59 48 / 30%);
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .og-comp-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin: 26px 0 0;
      padding: 16px;
      border-radius: 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-comp-meta-valor {
      display: block;
      margin-top: 4px;
      font-family: var(--nx-font-mono);
      font-size: 15px;
      font-variant-numeric: tabular-nums;
    }
    .og-comp-explica {
      margin: 20px 0 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--nx-text-mute);
      text-wrap: pretty;
    }
    .og-comp-lista {
      list-style: none;
      margin: 22px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      /* Linha larga rola dentro da própria caixa, nunca a página inteira. */
      overflow-x: auto;
    }
    .og-comp-linha {
      display: grid;
      grid-template-columns: 52px minmax(140px, 1fr) minmax(96px, auto) 76px 96px auto;
      gap: 12px;
      align-items: center;
      padding: 11px 13px;
      border-radius: 11px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-size: 14px;
      min-width: 560px;
    }
    .og-comp-num,
    .og-comp-hora,
    .og-comp-hash {
      font-family: var(--nx-font-mono);
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
      font-size: 12.5px;
    }
    .og-comp-num {
      color: var(--nx-orange-500);
    }
    .og-comp-dupla {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-comp-destino {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-comp-ressalva {
      display: block;
      margin-top: 6px;
      color: var(--nx-text);
      font-weight: 600;
    }
    .og-comp-origem {
      padding: 3px 8px;
      border-radius: 7px;
      background: rgb(122 162 255 / 14%);
      border: 1px solid rgb(122 162 255 / 40%);
      color: rgb(160 190 255);
      font-family: var(--nx-font-mono);
      font-size: 11px;
    }
    .og-comp-relaxed {
      padding: 3px 8px;
      border-radius: 7px;
      background: rgb(244 197 67 / 14%);
      border: 1px solid rgb(244 197 67 / 40%);
      color: var(--nx-pending);
      font-family: var(--nx-font-mono);
      font-size: 11px;
    }
    .og-comp-vazio,
    .og-comp-estado {
      color: var(--nx-text-mute);
      font-size: 15px;
    }
  `,
})
export class SorteioComprovanteComponent {
  readonly sessionId = input.required<string>();

  protected readonly store = inject(DrawSessionStore);

  constructor() {
    effect(() => this.store.sessionId.set(this.sessionId()));
  }

  protected readonly rows = computed(() => {
    const session = this.store.session();
    if (!session) return [];
    return session.reveals.map((reveal) => ({
      index: reveal.index,
      label: session.entrants.find((e) => e.teamId === reveal.teamId)?.label ?? reveal.teamId,
      destination: destinationLabelOf(reveal.destination),
      atMillis: reveal.atMillis,
      hash: reveal.hash,
      relaxed: reveal.relaxed,
      preassigned: !!reveal.preassigned,
      origin: revealOriginLabelOf(reveal),
    }));
  });

  /** Quantas linhas não foram sorteadas — a ressalva do cabeçalho depende disso. */
  protected readonly preassignedCount = computed(() =>
    preassignedCountOf(this.store.session()?.reveals ?? []),
  );

  protected shortHash(hash: string): string {
    return hash ? `${hash.slice(0, 10)}…` : '—';
  }

  protected relaxedLabel(relaxed: string[]): string {
    return relaxed.includes('same_city') ? 'cidade relaxada' : relaxed.join(', ');
  }

  protected padded(value: number): string {
    return String(value).padStart(2, '0');
  }
}
