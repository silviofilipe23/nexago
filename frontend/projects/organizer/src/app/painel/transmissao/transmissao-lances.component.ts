import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked, type WritableSignal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import { nomeCurtoDe } from '../../publico/overlay/overlay-nome';
import {
  LANCE_LABEL,
  LANCE_SEG_DEFAULT,
  LANCE_TARJA_IN_MS,
  lanceChave,
  lanceContagemOf,
  lanceDisparo,
  lancesDoEsporte,
  lanceTirada,
  type LanceTipo,
} from '../data/broadcast-lances';
import { resolveCourtNames } from '../data/matches-repository';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';
import { courtMatchOf } from './transmissao-selectors';

/** Lances de um atleta, na ordem das colunas da mesa (o esporte do torneio pode tirar alguns). */
const INDIVIDUAIS: readonly LanceTipo[] = ['block', 'ace', 'fire', 'dig', 'shark', 'cachorra'];

/** Cabeçalho de cada coluna: o fundamento do lance. */
const FUNDAMENTO: Record<LanceTipo, string> = {
  block: 'Bloqueio',
  ace: 'Saque',
  fire: 'Ataque',
  dig: 'Defesa',
  shark: 'De segunda',
  cachorra: 'Especial',
  rally: 'Rally',
  onfire: 'Sequência',
};

/** Uma fileira de teclas por atleta: dupla A à esquerda do teclado, dupla B à direita. A 6ª
 *  coluna (Cachorra) usa as teclas livres de cada lado: C/V na A, vírgula/ponto na B. A tecla é
 *  do lance, não da coluna: quando o esporte tira um lance, a tecla dele fica muda. */
const TECLAS: readonly (readonly [string, string])[] = [
  ['qwertc', 'asdfgv'],
  ['yuiop,', 'hjklç.'],
];
const TODAS_AS_TECLAS = TECLAS.flat().join('');

/** Rally Monstro e On Fire de cada dupla. */
const TECLAS_DUPLA: readonly (readonly [string, string])[] = [
  ['z', 'x'],
  ['n', 'm'],
];

/** Cor da dupla no pad aceso: laranja pra A, branco pra B. */
const COR = [
  { c: 'var(--nx-orange-500)', g: 'rgba(255, 106, 26, 0.45)' },
  { c: '#e8e8ea', g: 'rgba(232, 232, 234, 0.3)' },
] as const;

const SEG_OPCOES = [4, 6, 10] as const;
const RALLY = { min: 2, max: 60, padrao: 18 };
const SEQ = { min: 2, max: 15, padrao: 4 };

interface Pad {
  tipo: LanceTipo;
  lado: 0 | 1;
  atleta: 0 | 1;
  rotulo: string;
  quem: string;
  tecla: string;
  chave: string;
  vezes: number;
}

/** O lance que está passando agora, visto daqui. */
export interface LanceNoAr {
  chave: string;
  tipo: LanceTipo;
  rotulo: string;
  quem: string;
  fase: 'vinheta' | 'tarja';
  /** Duração total (vinheta + tarja); `null` = tarja até tirar do ar. */
  totalMs: number | null;
  decorridoMs: number;
}

/** Card "Lances" da tela Transmissão: uma mesa de pads, como um controlador MIDI. Cada atleta tem
 *  uma linha com um pad por lance — um toque escolhe o atleta e dispara o lance juntos (grava o
 *  objeto `lances` completo com `seq + 1`). Rally Monstro e On Fire ficam na linha da dupla.
 *  "Tirar do ar" grava `seq + 1` sem tipo, e a tela recolhe. A contagem por atleta mora em
 *  `lances.contagem`. */
@Component({
  selector: 'og-tx-lances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent, NgTemplateOutlet],
  template: `
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Lances'">
      <div class="og-lc-mx" role="group" aria-label="Mesa de lances" [style.grid-template-columns]="'128px repeat(' + individuais().length + ', minmax(0, 1fr))'">
        <span></span>
        @for (t of individuais(); track t) {
          <span class="og-lc-h">{{ fundamento[t] }}</span>
        }
        @for (d of mesa(); track d.lado) {
          @if (d.lado === 1) {
            <span class="og-lc-gap"></span>
          }
          @for (a of d.atletas; track $index) {
            <div class="og-lc-ath" [style.--c]="d.cor.c">
              <small>{{ d.rotulo }}</small>
              <b>{{ a.nome }}</b>
            </div>
            @for (p of a.pads; track p.chave) {
              <ng-container [ngTemplateOutlet]="pad" [ngTemplateOutletContext]="{ $implicit: p, cor: d.cor, wide: false }" />
            }
          }
          <div class="og-lc-ath og-lc-ath-dupla" [style.--c]="d.cor.c">
            <small>A dupla</small>
            <b>{{ d.curto }}</b>
          </div>
          @for (p of d.pads; track p.chave) {
            <ng-container [ngTemplateOutlet]="pad" [ngTemplateOutletContext]="{ $implicit: p, cor: d.cor, wide: true }" />
          }
          <span class="og-lc-resto"></span>
        }
      </div>

      <ng-template #pad let-p let-cor="cor" let-wide="wide">
        @let f = noAr()?.chave === p.chave ? noAr() : null;
        <button
          type="button"
          class="og-lc-pad"
          [class.wide]="wide"
          [class.fire]="!!f"
          [style.--c]="cor.c"
          [style.--g]="cor.g"
          [attr.title]="p.rotulo + ' · ' + p.quem"
          [attr.aria-label]="p.rotulo + ' · ' + p.quem"
          (click)="disparar(p)"
        >
          <span class="og-lc-led" aria-hidden="true"></span>
          <kbd class="og-lc-k">{{ p.tecla }}</kbd>
          <b>{{ p.rotulo }}{{ p.tipo === 'rally' ? ' · ' + rally() : p.tipo === 'onfire' ? ' · ' + seq() : '' }}</b>
          @if (p.vezes > 0) {
            <span class="og-lc-n">{{ p.vezes }}×</span>
          }
          @if (f && f.totalMs !== null) {
            <i class="og-lc-pg" [style.animation-duration.ms]="f.totalMs" [style.animation-delay.ms]="-f.decorridoMs"></i>
          }
        </button>
      </ng-template>

      <div class="og-lc-bar">
        <span class="og-lc-st" aria-live="polite">
          @if (noAr(); as f) {
            <i>● {{ f.fase === 'vinheta' ? 'ENTRANDO' : 'NO AR' }}</i><b>{{ f.rotulo }}</b> · {{ f.quem }}
          } @else {
            Toque num pad: atleta e lance saem juntos, direto para o ar.
          }
        </span>
        <button type="button" class="og-ghost-btn" [disabled]="!noAr()" (click)="tirarDoAr()">Tirar do ar</button>
        <button type="button" class="og-ghost-btn" (click)="zerar()">Zerar contagem</button>
      </div>

      <div class="og-lc-cfg">
        <span class="og-lc-campo">
          Trocas no rally
          <span class="og-lc-step" role="group" aria-label="Trocas no rally">
            <button type="button" aria-label="Menos trocas" (click)="passo(rally, -1, rallyLim)">−</button>
            <span>{{ rally() }}</span>
            <button type="button" aria-label="Mais trocas" (click)="passo(rally, 1, rallyLim)">+</button>
          </span>
        </span>
        <span class="og-lc-campo">
          Pontos seguidos
          <span class="og-lc-step" role="group" aria-label="Pontos seguidos">
            <button type="button" aria-label="Menos pontos" (click)="passo(seq, -1, seqLim)">−</button>
            <span>{{ seq() }}</span>
            <button type="button" aria-label="Mais pontos" (click)="passo(seq, 1, seqLim)">+</button>
          </span>
        </span>
        <span class="og-lc-campo">
          Tarja na tela
          <span class="og-lc-seg" role="radiogroup" aria-label="Tarja na tela">
            @for (s of segOpcoes; track s) {
              <button type="button" role="radio" [class.on]="seg() === s" [attr.aria-checked]="seg() === s" (click)="seg.set(s)">{{ s }} s</button>
            }
          </span>
        </span>
      </div>

      <p class="og-lc-dica">
        Teclado: cada atleta tem uma fileira de teclas — dupla A em <kbd>QWERT</kbd>/<kbd>ASDFG</kbd>, dupla B em <kbd>YUIOP</kbd>/<kbd>HJKLÇ</kbd>;
        Cachorra em <kbd>C</kbd> <kbd>V</kbd> (A) e <kbd>,</kbd> <kbd>.</kbd> (B);
        Rally e On Fire em <kbd>Z</kbd> <kbd>X</kbd> (A) e <kbd>N</kbd> <kbd>M</kbd> (B). Disparar outro lance enquanto um roda substitui o anterior.
        Ace, Monster Block, Fire Ball e Cachorra também aparecem no telão quando ele está com uma quadra só (na Cachorra, toque em quem levou a cobertura).
      </p>
    </og-card>
  `,
  styles: `
    .og-lc-mx {
      display: grid;
      gap: 6px;
    }
    .og-lc-h {
      align-self: end;
      padding-bottom: 2px;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      text-align: center;
      color: var(--nx-text-dim);
    }
    .og-lc-resto {
      grid-column: auto / -1;
    }
    .og-lc-gap {
      grid-column: 1 / -1;
      height: 6px;
    }
    .og-lc-ath {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      padding: 0 10px;
      border-radius: 8px;
      border-left: 3px solid var(--c);
      background: var(--nx-surface-1);
    }
    .og-lc-ath b {
      overflow: hidden;
      font: 600 13px var(--nx-font-display);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .og-lc-ath small {
      font: 500 10px var(--nx-font-mono);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-lc-ath-dupla {
      border: 1px dashed var(--nx-line-strong);
      border-left: 3px solid var(--c);
      background: transparent;
    }
    .og-lc-pad {
      position: relative;
      height: 64px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      padding: 7px 8px 6px;
      overflow: hidden;
      border: 1px solid var(--nx-line-strong);
      border-radius: 8px;
      background: linear-gradient(180deg, #1a1a1e, #111114);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 0 #000;
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
      transition: border-color 0.12s, transform 0.06s;
    }
    .og-lc-pad:hover {
      border-color: var(--c);
    }
    .og-lc-pad:focus-visible {
      outline: 2px solid var(--c);
      outline-offset: 2px;
    }
    .og-lc-pad:active {
      transform: translateY(2px);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }
    .og-lc-pad.wide {
      grid-column: span 2;
    }
    .og-lc-pad b {
      max-width: 100%;
      font: 700 12px/1.1 var(--nx-font-display);
      letter-spacing: -0.01em;
    }
    .og-lc-led {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--c);
      opacity: 0.28;
    }
    .og-lc-k {
      position: absolute;
      top: 5px;
      right: 6px;
      padding: 0;
      border: 0;
      background: none;
      font: 600 10px var(--nx-font-mono);
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-lc-n {
      position: absolute;
      right: 7px;
      bottom: 6px;
      font: 700 10px var(--nx-font-mono);
      color: var(--nx-text-dim);
    }
    .og-lc-pad.fire {
      border-color: var(--c);
      background: var(--c);
      box-shadow: 0 0 0 1px var(--c), 0 0 26px var(--g);
      color: #0a0a0a;
    }
    .og-lc-pad.fire .og-lc-led {
      background: #0a0a0a;
      opacity: 1;
      animation: og-lc-blink 0.5s steps(2) infinite;
    }
    .og-lc-pad.fire .og-lc-k,
    .og-lc-pad.fire .og-lc-n {
      color: rgba(10, 10, 10, 0.6);
    }
    .og-lc-pg {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: rgba(10, 10, 10, 0.45);
      transform-origin: left;
      animation: og-lc-pg linear forwards;
    }
    @keyframes og-lc-pg {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }
    @keyframes og-lc-blink {
      50% {
        opacity: 0.2;
      }
    }

    .og-lc-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
    }
    .og-lc-st {
      flex: 1;
      min-width: 180px;
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-lc-st b {
      font-weight: 600;
      color: var(--nx-text);
    }
    .og-lc-st i {
      margin-right: 6px;
      font: 700 11px var(--nx-font-mono);
      font-style: normal;
      letter-spacing: 0.08em;
      color: var(--nx-live, #ff3b30);
    }
    .og-lc-bar button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .og-lc-cfg {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 18px;
      margin-top: 14px;
    }
    .og-lc-campo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-lc-step {
      display: inline-flex;
      align-items: center;
      overflow: hidden;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-1);
    }
    .og-lc-step button {
      width: 26px;
      height: 28px;
      border: 0;
      background: none;
      color: var(--nx-text-mute);
      cursor: pointer;
    }
    .og-lc-step button:hover {
      background: var(--nx-surface-2);
    }
    .og-lc-step span {
      min-width: 28px;
      text-align: center;
      font: 700 12px var(--nx-font-mono);
      color: var(--nx-text);
    }
    .og-lc-seg {
      display: flex;
      gap: 4px;
    }
    .og-lc-seg button {
      padding: 5px 11px;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-pill);
      background: none;
      color: var(--nx-text);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .og-lc-seg button.on {
      border-color: transparent;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange, #0a0a0a);
    }
    .og-lc-dica {
      margin: 14px 0 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--nx-text-dim);
    }
    .og-lc-dica kbd {
      padding: 1px 5px;
      border: 1px solid var(--nx-line-strong);
      border-radius: 4px;
      font: 600 10px var(--nx-font-mono);
      color: var(--nx-text-mute);
    }
  `,
})
export class TransmissaoLancesComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura nem título próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  /** Colunas da mesa no esporte do torneio. */
  protected readonly individuais = computed(() => {
    const doEsporte = lancesDoEsporte(this.svc.tournament()?.sportId);
    return INDIVIDUAIS.filter((t) => doEsporte.includes(t));
  });
  protected readonly fundamento = FUNDAMENTO;
  protected readonly segOpcoes = SEG_OPCOES;
  protected readonly rallyLim = RALLY;
  protected readonly seqLim = SEQ;

  protected readonly seg = signal(LANCE_SEG_DEFAULT);
  protected readonly rally = signal(RALLY.padrao);
  protected readonly seq = signal(SEQ.padrao);

  /** Hora do último disparo daqui: o `at` do servidor só volta depois da escrita. */
  private readonly local = signal<{ seq: number; t0: number } | null>(null);
  /** Sobe quando a vinheta vira tarja e quando a tarja sai — o resto é CSS. */
  private readonly relogio = signal(0);

  /** Partida da quadra transmitida e o elenco de cada dupla, quando o painel já os tem. */
  private readonly elenco = computed(() => {
    const matches = resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []);
    const m = courtMatchOf(matches, this.svc.control().courtId, Date.now());
    const rosters = this.svc.rosters();
    const side = (teamId: string | undefined, label: string): [string, string] => {
      const nomes = ((teamId ? rosters.get(teamId)?.members : undefined) ?? []).map((p) => nomeCurtoDe(p.name)).filter((n) => n !== '');
      return [nomes[0] ?? `${label} · 1`, nomes[1] ?? `${label} · 2`];
    };
    return [side(m?.teamAId, 'Dupla A'), side(m?.teamBId, 'Dupla B')] as const;
  });

  /** As duas duplas: uma linha por atleta (cinco pads) e a linha da dupla (Rally e On Fire). */
  protected readonly mesa = computed(() => {
    const tally = lanceContagemOf(this.svc.control().lances.contagem);
    return ([0, 1] as const).map((lado) => {
      const atletas = this.elenco()[lado];
      const rotulo = lado === 0 ? 'Dupla A' : 'Dupla B';
      const pad = (tipo: LanceTipo, atleta: 0 | 1, quem: string, tecla: string): Pad => {
        const chave = lanceChave(tipo, lado, atleta);
        return { tipo, lado, atleta, rotulo: LANCE_LABEL[tipo], quem, tecla, chave, vezes: tally[chave] ?? 0 };
      };
      return {
        lado,
        rotulo,
        cor: COR[lado],
        curto: atletas.map((n) => n.split(' ')[0]).join(' / '),
        atletas: ([0, 1] as const).map((a) => ({
          nome: atletas[a],
          pads: this.individuais().map((t) => pad(t, a, atletas[a], TECLAS[lado][a][INDIVIDUAIS.indexOf(t)])),
        })),
        pads: [pad('rally', 0, atletas.join(' / '), TECLAS_DUPLA[lado][0]), pad('onfire', 0, atletas.join(' / '), TECLAS_DUPLA[lado][1])],
      };
    });
  });

  private readonly pads = computed(() => this.mesa().flatMap((d) => [...d.atletas.flatMap((a) => a.pads), ...d.pads]));

  /** O lance que está passando: pelo disparo daqui ou pelo `at` gravado (outro operador). */
  readonly noAr = computed<LanceNoAr | null>(() => {
    this.relogio();
    const l = this.svc.control().lances;
    if (l.tipo === null || l.seq <= 0) return null;
    const local = this.local();
    const t0 = local && local.seq === l.seq ? local.t0 : (l.at?.getTime() ?? null);
    if (t0 === null) return null;
    const decorridoMs = Math.max(0, Date.now() - t0);
    const totalMs = l.seg > 0 ? LANCE_TARJA_IN_MS + l.seg * 1000 : null;
    if (totalMs !== null && decorridoMs >= totalMs) return null;
    const chave = lanceChave(l.tipo, l.lado, l.atleta);
    const pad = this.pads().find((p) => p.chave === chave);
    return {
      chave,
      tipo: l.tipo,
      rotulo: LANCE_LABEL[l.tipo],
      quem: pad?.quem ?? '',
      fase: decorridoMs < LANCE_TARJA_IN_MS ? 'vinheta' : 'tarja',
      totalMs,
      decorridoMs,
    };
  });

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      const f = this.noAr();
      untracked(() => {
        clearTimeout(timer);
        if (!f) return;
        const proximo = f.fase === 'vinheta' ? LANCE_TARJA_IN_MS : f.totalMs;
        if (proximo !== null) timer = setTimeout(() => this.relogio.update((n) => n + 1), proximo - f.decorridoMs + 20);
      });
    });
  }

  protected passo(alvo: WritableSignal<number>, d: number, lim: { min: number; max: number }): void {
    alvo.update((v) => Math.min(lim.max, Math.max(lim.min, v + d)));
  }

  protected disparar(p: Pad): void {
    const next = lanceDisparo(this.svc.control().lances, {
      tipo: p.tipo,
      lado: p.lado,
      atleta: p.atleta,
      n: p.tipo === 'rally' ? this.rally() : p.tipo === 'onfire' ? this.seq() : undefined,
      seg: this.seg(),
    });
    this.local.set({ seq: next.seq, t0: Date.now() });
    void this.svc.save({ lances: { ...next, at: serverTimestamp() } });
  }

  /** Tecla da mesa (a tela só chama com o card de Lances aberto). `true` = era um lance. */
  tecla(key: string): boolean {
    const k = key.toLowerCase() === ';' ? 'ç' : key.toLowerCase();
    if (k.length !== 1) return false;
    const p = this.pads().find((x) => x.tecla === k);
    if (p) this.disparar(p);
    // Tecla de lance fora do esporte: engole, pra não cair no atalho da lista.
    return p !== undefined || TODAS_AS_TECLAS.includes(k);
  }

  /** Recolhe o lance que está passando; a contagem fica. */
  tirarDoAr(): void {
    if (!this.noAr()) return;
    this.local.set(null);
    void this.svc.save({ lances: { ...lanceTirada(this.svc.control().lances), at: serverTimestamp() } });
  }

  /** Zera a contagem por atleta sem disparar nada (`seq` e o resto ficam como estão). */
  protected zerar(): void {
    const l = this.svc.control().lances;
    void this.svc.save({ lances: { ...l, contagem: '{}' } });
  }
}
