import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Relógio do sorteio: um sinal que avança sozinho e alimenta o motor de fase.
 *
 * `setInterval`, e NÃO `requestAnimationFrame`, por dois motivos concretos:
 *
 *  1. o telão fica horas aberto numa TV, muitas vezes em aba de fundo — e
 *     navegador não entrega animation frames pra aba escondida, o que
 *     congelaria a transmissão exatamente quando ninguém está olhando pro
 *     notebook;
 *  2. o painel de preview usado na verificação visual não entrega animation
 *     frames nenhum, então uma tela presa em rAF é impossível de conferir.
 *
 * 100 ms é folgado pro que a tela precisa (as fases duram segundos) e barato.
 *
 * SEM `providedIn` — cada tela provê a própria instância e o intervalo morre com
 * ela.
 */
@Injectable()
export class DrawClockService {
  readonly now = signal(Date.now());

  constructor() {
    const handle = setInterval(() => this.now.set(Date.now()), 100);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
  }
}
