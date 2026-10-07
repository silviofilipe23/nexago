import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { EVENTO_STATUS_LABEL, type EventoItem, type EventosCard, type EventosMode } from '../../painel/data/broadcast-eventos';
import { shareQrSvgDataUrl } from '../../painel/data/share-qr';
import {
  EVENTOS_STRIP_MS,
  eventoDataOf,
  eventoDiaSemanaOf,
  eventoDiasRestantes,
  eventoDuracaoLabel,
  eventoLocalLabel,
  eventoPremiacaoLabel,
  eventoVagasPct,
} from './overlay-eventos';

/** O QR e o endereço da tela levam ao download do app (um link só, igual pra todos os eventos). */
export const EVENTOS_APP_URL = 'https://linktr.ee/nexago';

/** Troca de evento na faixa: o atual sobe e some (0,28 s) e o próximo entra de baixo (0,48 s). */
const STRIP_OUT_MS = 280;

/** Próximos eventos (1920×1080): agenda de torneios, em dois modos — tela cheia opaca (próxima etapa
 *  em destaque + "na sequência") ou faixa (lower third) que troca de evento a cada 7 s.
 *
 *  Só apresentação: o card vem pronto do painel (`broadcast/control.eventos`). O QR é gerado aqui
 *  do link do app (`EVENTOS_APP_URL`). */
@Component({
  selector: 'og-overlay-eventos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (card(); as c) {
      @if (mode() === 'full') {
        <div class="tela" animate.enter="ev-fade-in" animate.leave="ev-fade-out">
          <i class="luz" aria-hidden="true"></i>
          @for (k of ['full']; track k) {
            <header class="head">
              <div>
                <div class="linha1 ev-up" style="--d: 0.1s">
                  <span class="selo"><b class="shine" aria-hidden="true"></b>Agenda</span>
                  @if (c.season) { <span class="temporada">{{ c.season }}</span> }
                </div>
                <h1 class="ev-up" style="--d: 0.2s">Próximos <em>eventos</em></h1>
              </div>
              <span class="marca ev-up" style="--d: 0.1s">NEXA<b>GO</b></span>
            </header>

            @if (c.items[0]; as e) {
              <article class="destaque ev-up" style="--d: 0.35s">
                <i class="borda" aria-hidden="true"></i>
                <div class="foto" [class.foto--vazia]="!e.coverUrl">
                  @if (e.coverUrl) { <img [src]="e.coverUrl" alt="" /> } @else { <span>Foto da arena / etapa</span> }
                  <div class="tags">
                    <span class="pil pil--prox">Próxima etapa</span>
                    <span class="pil" [class]="'pil st st--' + e.status"><i class="pt"></i>{{ statusLabel(e) }}</span>
                  </div>
                  <div class="dias">
                    <b>{{ dias(e) }}</b>
                    <span>Dias restantes</span>
                  </div>
                </div>
                <div class="corpo">
                  <div class="titulo">
                    <div class="data">
                      <b>{{ data(e).dias }}</b>
                      <span>{{ data(e).mes }}</span>
                    </div>
                    <div>
                      <h2>{{ e.name }}</h2>
                      <p class="local"><b>{{ e.venue }}</b>@if (e.city) { <i>·</i> <span>{{ e.city }}</span> }@if (e.state) { <i>·</i> <span>{{ e.state }}</span> }<i>·</i> <span>{{ diaSemana(e) }}</span></p>
                    </div>
                  </div>
                  @if (e.categories.length > 0) {
                    <div class="cats">
                      @for (cat of e.categories; track $index) { <span class="cat">{{ cat }}</span> }
                    </div>
                  }
                  <div class="stats">
                    @if (premio(e); as p) {
                      <div class="st1"><span class="k">Premiação</span><b class="laranja">{{ p }}</b></div>
                    }
                    <div class="st1"><span class="k">Duração</span><b>{{ duracao(e) }}</b></div>
                    @if (pct(e) !== null) {
                      <div class="vagas">
                        <span class="k">Vagas · {{ e.filled }}/{{ e.total }}</span>
                        <i class="barra"><u [style.width.%]="pct(e)"></u></i>
                        <b>{{ pct(e) }}%</b>
                      </div>
                    }
                    <div class="qr" [class.qr--vazio]="!qr()">
                      @if (qr(); as src) { <img [src]="src" alt="QR para baixar o app" /> } @else { <span>QR<br />app</span> }
                    </div>
                  </div>
                </div>
              </article>
            }

            @if (c.items.length > 1) {
              <section class="seq">
                <div class="seq-h ev-up" style="--d: 0.45s"><span>Na sequência</span><span>{{ c.items.length - 1 }} {{ c.items.length - 1 === 1 ? 'evento' : 'eventos' }}</span></div>
                @for (e of c.items.slice(1); track e.id; let i = $index) {
                  <div class="lin ev-up" [style.--d]="0.55 + i * 0.1 + 's'">
                    <div class="lin-data"><b>{{ data(e).dias }}</b><span>{{ data(e).mes }}</span></div>
                    <div class="lin-t">
                      <b class="lin-n">{{ e.name }}</b>
                      <span class="lin-l">{{ local(e) }}</span>
                    </div>
                    <div class="lin-d">
                      @if (premio(e); as p) { <b>{{ p }}</b> }
                      <span class="pil" [class]="'pil st st--' + e.status">{{ statusLabel(e) }}</span>
                    </div>
                  </div>
                }
              </section>
            }

            <footer class="rodape ev-up" style="--d: 0.9s">
              <span>Baixe o app <b>NexaGO</b></span>
              <span class="site">{{ site }}</span>
            </footer>
          }
        </div>
      } @else {
        @if (atual(); as e) {
          <div class="faixa" animate.enter="ev-strip-in" animate.leave="ev-strip-out">
            <div class="f-agenda"><span>Agenda</span><b>Próximos<br />eventos</b></div>
            <div class="f-corpo">
              @for (item of [e]; track item.id) {
                <div class="f-evento" [class.f-evento--sai]="saindo()">
                  <div class="f-data"><b>{{ data(item).dias }}</b><span>{{ data(item).mes }}</span></div>
                  <div class="f-t">
                    <b class="f-n">{{ item.name }}</b>
                    <span class="f-l">{{ local(item) }}</span>
                  </div>
                  <div class="f-d">
                    @if (premio(item); as p) { <b>{{ p }}</b> }
                    <span class="pil" [class]="'pil st st--' + item.status">{{ statusLabel(item) }}</span>
                  </div>
                </div>
              }
              <div class="f-prog" aria-hidden="true">
                @for (it of c.items; track it.id; let i = $index) {
                  <i [class.cheio]="i < indice()"><u [class.enche]="i === indice()"></u></i>
                }
              </div>
            </div>
            <div class="f-qr">
              <div class="qr qr--s" [class.qr--vazio]="!qr()">
                @if (qr(); as src) { <img [src]="src" alt="QR para baixar o app" /> } @else { <span>QR</span> }
              </div>
              <div class="f-site"><span>Baixe o app</span><b>{{ site }}</b></div>
            </div>
          </div>
        }
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute;
      inset: 0;
      z-index: 62;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    @property --ev-ang {
      syntax: '<angle>';
      inherits: false;
      initial-value: 0deg;
    }
    .tela {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #0a0a0b;
    }
    .ev-fade-in {
      animation: ev-fade 0.5s ease both;
    }
    .ev-fade-out {
      animation: ev-sai 0.4s cubic-bezier(0.55, 0, 1, 0.45) both;
    }
    @keyframes ev-fade {
      from {
        opacity: 0;
      }
    }
    @keyframes ev-sai {
      to {
        opacity: 0;
      }
    }
    .luz {
      position: absolute;
      left: -140px;
      top: -240px;
      width: 1000px;
      height: 740px;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.22), transparent 65%);
    }
    .ev-up {
      animation: ev-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes ev-up {
      from {
        opacity: 0;
        transform: translateY(24px);
        filter: blur(6px);
      }
    }

    .head {
      position: absolute;
      left: 70px;
      right: 70px;
      top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .linha1 {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .selo {
      position: relative;
      overflow: hidden;
      padding: 9px 18px;
      border-radius: 6px;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.26em;
      text-transform: uppercase;
    }
    .shine {
      position: absolute;
      inset: 0 auto 0 0;
      width: 38%;
      background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.6), transparent);
      transform: translateX(-160%) skewX(-18deg);
      animation: ev-shine 3.2s ease-in-out infinite;
    }
    @keyframes ev-shine {
      0%,
      70% {
        transform: translateX(-160%) skewX(-18deg);
      }
      100% {
        transform: translateX(420%) skewX(-18deg);
      }
    }
    .temporada {
      font-family: var(--mono);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }
    h1 {
      margin: 10px 0 0;
      font-size: 104px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
      text-transform: uppercase;
    }
    h1 em {
      font-style: normal;
      color: var(--o5);
    }
    .marca {
      margin-top: 62px;
      font-size: 34px;
      font-weight: 800;
    }
    .marca b {
      color: var(--o5);
    }

    .destaque {
      position: absolute;
      left: 72px;
      top: 252px;
      width: 888px;
      height: 640px;
      box-sizing: border-box;
      overflow: hidden;
      border-radius: 20px;
      background: #0f0f11;
    }
    /* Traço de luz laranja e branco girando pela borda (4 s por volta). */
    .borda {
      position: absolute;
      inset: 0;
      border-radius: 20px;
      padding: 2px;
      background: conic-gradient(from var(--ev-ang), rgba(255, 106, 26, 0.35), var(--o5), #fff, var(--o5), rgba(255, 106, 26, 0.35));
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      animation: ev-gira 4s linear infinite;
      z-index: 3;
      pointer-events: none;
    }
    @keyframes ev-gira {
      to {
        --ev-ang: 360deg;
      }
    }
    .foto {
      position: relative;
      height: 258px;
      background: #19191c;
    }
    .foto::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(10, 10, 11, 0.25), rgba(15, 15, 17, 0.95));
    }
    .foto img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .foto--vazia {
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0 12px, transparent 12px 24px), #151517;
      display: grid;
      place-items: center;
    }
    .foto--vazia span {
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
    }
    .tags {
      position: absolute;
      left: 22px;
      top: 22px;
      z-index: 2;
      display: flex;
      gap: 10px;
    }
    .pil {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(10, 10, 11, 0.7);
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .pil--prox {
      background: var(--o5);
      border-color: var(--o5);
      color: #120600;
    }
    .st .pt {
      display: none;
    }
    .st--abertas {
      color: var(--o4);
      border-color: rgba(255, 106, 26, 0.55);
      background: rgba(255, 106, 26, 0.1);
    }
    .tags .st--abertas .pt {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--o5);
      box-shadow: 0 0 10px var(--o5);
      animation: ev-pt 1.4s ease-in-out infinite;
    }
    @keyframes ev-pt {
      50% {
        opacity: 0.35;
        transform: scale(0.8);
      }
    }
    .st--ultimas {
      background: var(--o5);
      border-color: var(--o5);
      color: #120600;
    }
    .st--breve,
    .st--encerradas {
      color: rgba(255, 255, 255, 0.55);
      background: rgba(255, 255, 255, 0.05);
    }
    .st--esgotado {
      background: #f1f1f3;
      border-color: #f1f1f3;
      color: #111;
    }
    .dias {
      position: absolute;
      right: 22px;
      top: 22px;
      z-index: 2;
      padding: 12px 22px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(10, 10, 11, 0.78);
      text-align: right;
    }
    .dias b {
      display: block;
      font-size: 62px;
      line-height: 1;
      font-weight: 800;
      color: var(--o5);
    }
    .dias span {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
    }
    .corpo {
      position: absolute;
      left: 0;
      right: 0;
      top: 258px;
      bottom: 0;
      padding: 0 28px 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-top: -78px;
      z-index: 2;
    }
    .titulo {
      display: flex;
      align-items: center;
      gap: 22px;
    }
    .data {
      flex: none;
      width: 128px;
      height: 128px;
      border-radius: 14px;
      background: var(--o5);
      color: #120600;
      display: grid;
      place-items: center;
      align-content: center;
      text-align: center;
    }
    .data b {
      font-size: 50px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .data span {
      font-family: var(--mono);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.22em;
    }
    h2 {
      margin: 0;
      font-size: 56px;
      font-weight: 800;
      line-height: 1.02;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    .local {
      margin: 10px 0 0;
      font-family: var(--mono);
      font-size: 15px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .local b {
      color: #fff;
    }
    .local i {
      font-style: normal;
      margin: 0 8px;
    }
    .cats {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .cat {
      padding: 8px 18px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.04);
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .stats {
      margin-top: auto;
      display: flex;
      align-items: center;
      gap: 36px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .st1 {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .k {
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .st1 b {
      font-size: 36px;
      font-weight: 800;
    }
    .st1 b.laranja {
      color: var(--o5);
      font-size: 40px;
    }
    .vagas {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      min-width: 0;
    }
    .vagas b {
      font-size: 32px;
      font-weight: 800;
    }
    .barra {
      display: block;
      height: 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.12);
      overflow: hidden;
    }
    .barra u {
      display: block;
      height: 100%;
      background: var(--o5);
      text-decoration: none;
    }
    .qr {
      flex: none;
      width: 114px;
      height: 114px;
      margin-left: auto;
      box-sizing: border-box;
      padding: 6px;
      border-radius: 8px;
      background: #fff;
    }
    .qr img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .qr--vazio {
      border: 1.5px dashed rgba(255, 255, 255, 0.28);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0 8px, transparent 8px 16px);
      display: grid;
      place-items: center;
      text-align: center;
    }
    .qr--vazio span {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .seq {
      position: absolute;
      left: 1000px;
      top: 252px;
      width: 818px;
    }
    .seq-h {
      display: flex;
      justify-content: space-between;
      margin-bottom: 14px;
      font-family: var(--mono);
      font-size: 13px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .lin {
      display: grid;
      grid-template-columns: 124px 1fr auto;
      align-items: center;
      height: 138px;
      margin-bottom: 14px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      background: #111113;
      overflow: hidden;
    }
    .lin-data {
      height: 100%;
      display: grid;
      place-items: center;
      align-content: center;
      border-right: 1px solid rgba(255, 255, 255, 0.07);
      background: rgba(255, 255, 255, 0.025);
    }
    .lin-data b {
      font-size: 44px;
      font-weight: 800;
      letter-spacing: -0.04em;
    }
    .lin-data span {
      font-family: var(--mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.2em;
      color: var(--o5);
    }
    .lin-t {
      padding: 0 22px;
      min-width: 0;
    }
    .lin-n {
      display: block;
      font-size: 38px;
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lin-l {
      display: block;
      margin-top: 8px;
      font-family: var(--mono);
      font-size: 13px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .lin-d {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
      padding-right: 24px;
    }
    .lin-d b {
      font-size: 30px;
      font-weight: 800;
    }

    .rodape {
      position: absolute;
      left: 70px;
      right: 70px;
      bottom: 38px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      font-family: var(--mono);
      font-size: 15px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .rodape b {
      color: #fff;
    }
    .site {
      color: var(--o5);
      font-weight: 700;
    }

    /* Faixa (lower third). */
    .faixa {
      position: absolute;
      left: 60px;
      right: 60px;
      bottom: 64px;
      height: 138px;
      display: flex;
      overflow: hidden;
      border-radius: 14px;
      background: linear-gradient(180deg, #131316, #0b0b0c);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    }
    .ev-strip-in {
      animation: ev-strip-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .ev-strip-out {
      animation: ev-strip-out 0.38s cubic-bezier(0.55, 0, 1, 0.45) both;
    }
    @keyframes ev-strip-in {
      from {
        opacity: 0;
        transform: translateY(40px);
      }
    }
    @keyframes ev-strip-out {
      to {
        opacity: 0;
        transform: translateY(30px);
      }
    }
    .f-agenda {
      flex: none;
      width: 240px;
      background: var(--o5);
      color: #120600;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 32px;
      gap: 6px;
    }
    .f-agenda span {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.3em;
      text-transform: uppercase;
    }
    .f-agenda b {
      font-size: 34px;
      font-weight: 800;
      line-height: 0.98;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    .f-corpo {
      flex: 1;
      min-width: 0;
      position: relative;
      overflow: hidden;
    }
    .f-evento {
      position: absolute;
      inset: 0 0 12px 0;
      display: grid;
      grid-template-columns: 112px 1fr auto;
      align-items: center;
      column-gap: 22px;
      padding: 0 28px;
      animation: ev-troca-in 0.48s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .f-evento--sai {
      animation: ev-troca-out 0.28s cubic-bezier(0.55, 0, 1, 0.45) both;
    }
    @keyframes ev-troca-in {
      from {
        opacity: 0;
        transform: translateY(32px);
      }
    }
    @keyframes ev-troca-out {
      to {
        opacity: 0;
        transform: translateY(-32px);
      }
    }
    .f-data {
      width: 100px;
      height: 100px;
      border-radius: 12px;
      background: var(--o5);
      color: #120600;
      display: grid;
      place-items: center;
      align-content: center;
      text-align: center;
    }
    .f-data b {
      font-size: 38px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .f-data span {
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2em;
    }
    .f-t {
      min-width: 0;
    }
    .f-n {
      display: block;
      font-size: 46px;
      font-weight: 800;
      line-height: 1.04;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .f-l {
      display: block;
      margin-top: 8px;
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .f-d {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
    }
    .f-d b {
      font-size: 36px;
      font-weight: 800;
    }
    .f-prog {
      position: absolute;
      left: 28px;
      right: 28px;
      bottom: 0;
      height: 5px;
      display: flex;
      gap: 6px;
    }
    .f-prog i {
      flex: 1;
      height: 100%;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.14);
      overflow: hidden;
      position: relative;
    }
    .f-prog i.cheio {
      background: var(--o5);
    }
    .f-prog u {
      position: absolute;
      inset: 0;
      background: var(--o5);
      transform: scaleX(0);
      transform-origin: 0 50%;
      text-decoration: none;
    }
    .f-prog u.enche {
      animation: ev-enche ${EVENTOS_STRIP_MS}ms linear forwards;
    }
    @keyframes ev-enche {
      to {
        transform: scaleX(1);
      }
    }
    .f-qr {
      flex: none;
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 0 28px;
      border-left: 1px solid rgba(255, 255, 255, 0.08);
    }
    .qr--s {
      width: 94px;
      height: 94px;
      margin-left: 0;
    }
    .f-site {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .f-site b {
      color: var(--o5);
    }
  `,
})
export class OverlayEventosComponent {
  readonly card = input<EventosCard | null>(null);
  readonly mode = input<EventosMode>('full');

  protected readonly site = EVENTOS_APP_URL.replace(/^https?:\/\//, '');

  private readonly now = signal(Date.now());
  /** Faixa: índice do evento na tela e a fase de saída entre um e outro. */
  protected readonly indice = signal(0);
  protected readonly saindo = signal(false);
  protected readonly qr = signal<string | null>(null);

  protected readonly atual = computed<EventoItem | null>(() => {
    const items = this.card()?.items ?? [];
    return items[this.indice() % Math.max(items.length, 1)] ?? null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Dias restantes pela data de hoje: relógio de 1 min basta.
    const clock = setInterval(() => this.now.set(Date.now()), 60_000);
    destroyRef.onDestroy(() => clearInterval(clock));

    // QR do download do app, gerado uma vez (assíncrono).
    void shareQrSvgDataUrl(EVENTOS_APP_URL).then((src) => this.qr.set(src));

    // Faixa: a cada 7 s o atual sobe e some (0,28 s) e o próximo entra de baixo; reinicia a cada card novo.
    effect((onCleanup) => {
      const c = this.card();
      const strip = this.mode() === 'strip';
      untracked(() => {
        this.indice.set(0);
        this.saindo.set(false);
      });
      if (!c || !strip || c.items.length < 2) return;
      let out: ReturnType<typeof setTimeout> | undefined;
      const h = setInterval(() => {
        this.saindo.set(true);
        out = setTimeout(() => {
          this.indice.update((i) => (i + 1) % c.items.length);
          this.saindo.set(false);
        }, STRIP_OUT_MS);
      }, EVENTOS_STRIP_MS);
      onCleanup(() => {
        clearInterval(h);
        clearTimeout(out);
      });
    });
  }

  protected data(e: EventoItem) {
    return eventoDataOf(e);
  }
  protected diaSemana(e: EventoItem): string {
    return eventoDiaSemanaOf(e);
  }
  protected dias(e: EventoItem): number {
    return eventoDiasRestantes(e, this.now());
  }
  protected duracao(e: EventoItem): string {
    return eventoDuracaoLabel(e);
  }
  protected premio(e: EventoItem): string | null {
    return eventoPremiacaoLabel(e.prizeCents);
  }
  protected pct(e: EventoItem): number | null {
    return eventoVagasPct(e);
  }
  protected local(e: EventoItem): string {
    return eventoLocalLabel(e);
  }
  protected statusLabel(e: EventoItem): string {
    return EVENTO_STATUS_LABEL[e.status];
  }
}
