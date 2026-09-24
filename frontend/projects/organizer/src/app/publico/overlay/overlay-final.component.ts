import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import type { FinalPlacar } from './overlay-final';

export interface FinalCampeoes {
  campeao: [string, string];
  vice: [string, string];
  placar: FinalPlacar;
}

interface Confete {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  c: string;
  t: 'rect' | 'spark' | 'crown';
  fl: number;
}

const CORES = ['#FFF4C4', '#F7D46A', '#E9B949', '#C98E1C', '#FFFFFF', '#FBE08A', '#A26E12'];
const EASE = 'cubic-bezier(.22,1,.36,1)';

/** Resultado da final — porte do protótipo do dono.
 *
 *  A sequência de entrada e o confete são imperativos (Web Animations + canvas), como no
 *  original: os tempos SÃO a especificação, e traduzi-los pra outra técnica só abriria espaço pra
 *  divergir deles. O que mudou foi o ciclo de vida — nada roda fora da tela, e tudo é cancelado
 *  ao sair. Numa transmissão de horas, um laço de canvas esquecido é CPU queimada até o fim. */
@Component({
  selector: 'og-overlay-final',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overlay-final.component.html',
  styleUrl: './overlay-final.component.css',
})
export class OverlayFinalComponent {
  readonly resultado = input<FinalCampeoes | null>(null);
  readonly torneio = input('');
  readonly categoria = input<string | null>(null);
  readonly quadra = input<string | null>(null);

  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly letras = computed(() => [...'CAMPEÕES']);

  protected readonly contexto = computed(() =>
    [this.categoria(), this.quadra() ? `Quadra ${this.quadra()}` : null]
      .filter((p) => !!p)
      .join(' · '),
  );

  private particulas: Confete[] = [];
  private chuva = false;
  private raf = 0;
  private readonly animacoes: Animation[] = [];
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  private observador: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.encaixar();
      this.entrar();
    });
    inject(DestroyRef).onDestroy(() => this.parar());
  }

  /** A arte é fixa em 1920x1080 e a tela pode ser outra: escala pra caber, como o telão faz.
   *  No OBS a fonte já é 1920x1080, então a escala dá 1 e nada se mexe. */
  private encaixar(): void {
    const fit = this.el<HTMLElement>('#fit');
    const root = this.el<HTMLElement>('#root');
    if (!fit || !root) return;

    const aplicar = () => {
      const s = Math.min(root.clientWidth / 1920, root.clientHeight / 1080);
      fit.style.transform = `scale(${s}) translate(-50%, -50%)`;
    };
    aplicar();
    this.observador = new ResizeObserver(aplicar);
    this.observador.observe(root);
  }

  private el<T extends Element>(seletor: string): T | null {
    return (this.host.nativeElement as HTMLElement).querySelector<T>(seletor);
  }

  private anima(seletor: string, quadros: Keyframe[], opcoes: KeyframeAnimationOptions): void {
    const alvo = this.el(seletor);
    if (!alvo) return;
    this.animacoes.push(alvo.animate(quadros, { fill: 'both', easing: EASE, ...opcoes }));
  }

  private depois(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  /** Sequência de entrada, nos tempos especificados pelo dono. */
  private entrar(): void {
    if (!this.resultado()) return;

    this.anima('#stage', [{ opacity: 0 }, { opacity: 1 }], { duration: 600 });
    this.anima(
      '.rays',
      [
        { transform: 'scale(.2)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 1400, delay: 200, composite: 'add' },
    );
    this.anima(
      '.kick',
      [
        { opacity: 0, letterSpacing: '.8em' },
        { opacity: 1, letterSpacing: '.34em' },
      ],
      { duration: 900, delay: 300 },
    );
    this.anima(
      '.crown',
      [
        { transform: 'translateY(-520px) scale(1.5) rotate(-14deg)', opacity: 0 },
        { transform: 'translateY(18px) scale(.94) rotate(3deg)', opacity: 1, offset: 0.7 },
        { transform: 'translateY(-6px) scale(1.03)', offset: 0.86 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 1100, delay: 700, easing: 'cubic-bezier(.5,0,.4,1)' },
    );
    this.anima(
      '.flash',
      [
        { opacity: 0, transform: 'scale(.3)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.25 },
        { opacity: 0, transform: 'scale(1.4)' },
      ],
      { duration: 1100, delay: 1400, easing: 'ease-out' },
    );
    this.depois(() => this.explodir(), 1450);

    this.cada('.gold span', (i) => ({
      quadros: [
        { opacity: 0, transform: 'translateY(60px) scale(2.2)', filter: 'blur(14px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' },
      ],
      opcoes: { duration: 700, delay: 1550 + i * 70 },
    }));

    for (const [seletor, giro, atraso] of [
      ['.mini[data-lado="esq"]', -14, 2200],
      ['.mini[data-lado="dir"]', 14, 2300],
    ] as const) {
      this.anima(
        seletor,
        [
          { opacity: 0, transform: `scale(0) rotate(${-giro * 2.85}deg)` },
          { opacity: 1, transform: `scale(1.25) rotate(${giro}deg)`, offset: 0.6 },
          { opacity: 1, transform: `rotate(${giro}deg)` },
        ],
        { duration: 700, delay: atraso },
      );
    }

    this.cada('.names .p', (i) => ({
      quadros: [
        { opacity: 0, transform: 'translateY(30px)' },
        { opacity: 1, transform: 'none' },
      ],
      opcoes: { duration: 700, delay: 2500 + i * 140 },
    }));

    this.anima('.cat', [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 3000 });
    this.anima(
      '.vice',
      [
        { opacity: 0, transform: 'translate(-50%,20px)' },
        { opacity: 1, transform: 'translate(-50%,0)' },
      ],
      { duration: 600, delay: 3400 },
    );

    this.depois(() => {
      this.chuva = true;
      this.rodar();
    }, 2200);
    this.depois(() => {
      this.semear(360, 560, -Math.PI / 2.4, 18, 70, 1);
      this.semear(1560, 560, -Math.PI / 1.7, 18, 70, 1);
      this.rodar();
    }, 4000);
  }

  private cada(
    seletor: string,
    fn: (i: number) => { quadros: Keyframe[]; opcoes: KeyframeAnimationOptions },
  ): void {
    const alvos = [...(this.host.nativeElement as HTMLElement).querySelectorAll(seletor)];
    alvos.forEach((alvo, i) => {
      const { quadros, opcoes } = fn(i);
      this.animacoes.push(alvo.animate(quadros, { fill: 'both', easing: EASE, ...opcoes }));
    });
  }

  /** Saída: a chuva para e a tela some com um leve zoom. */
  sair(): void {
    for (const t of this.timers.splice(0)) clearTimeout(t);
    this.chuva = false;
    const stage = this.el<HTMLElement>('#stage');
    if (!stage) return;
    this.animacoes.push(
      stage.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(1.03)' }], {
        duration: 500,
        fill: 'both',
        easing: 'ease-in',
      }),
    );
  }

  private parar(): void {
    this.observador?.disconnect();
    this.observador = null;
    for (const t of this.timers.splice(0)) clearTimeout(t);
    for (const a of this.animacoes.splice(0)) a.cancel();
    this.chuva = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.particulas = [];
  }

  private semear(x: number, y: number, a: number, spd: number, n: number, abertura: number): void {
    for (let i = 0; i < n; i++) {
      const ang = a + (Math.random() - 0.5) * abertura;
      const v = spd * (0.45 + Math.random() * 0.75);
      const r = Math.random();
      this.particulas.push({
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.35,
        w: 8 + Math.random() * 10,
        h: 5 + Math.random() * 7,
        c: CORES[(Math.random() * CORES.length) | 0]!,
        t: r < 0.08 ? 'crown' : r < 0.3 ? 'spark' : 'rect',
        fl: Math.random() * 6.28,
      });
    }
  }

  /** Explosão principal: uma parte sai da coroa pra cima, o resto dos dois cantos de baixo. */
  private explodir(): void {
    this.semear(960, 300, -Math.PI / 2, 22, 160, Math.PI * 1.6);
    this.semear(-10, 1080, -Math.PI / 3.2, 30, 110, 0.5);
    this.semear(1930, 1080, -Math.PI + Math.PI / 3.2, 30, 110, 0.5);
    this.rodar();
  }

  private rodar(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.quadro());
  }

  private quadro(): void {
    const cv = this.el<HTMLCanvasElement>('canvas');
    const cx = cv?.getContext('2d');
    if (!cx) {
      this.raf = 0;
      return;
    }

    cx.clearRect(0, 0, 1920, 1080);
    if (this.chuva && Math.random() < 0.55) {
      this.semear(Math.random() * 1920, -20, Math.PI / 2, 2, 1, 0.6);
    }

    for (const p of this.particulas) {
      p.vy += 0.16;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx + Math.sin(p.fl) * 0.8;
      p.y += p.vy;
      p.rot += p.vr;
      p.fl += 0.08;

      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.rot);
      cx.fillStyle = p.c;
      if (p.t === 'rect') {
        cx.scale(1, Math.cos(p.fl * 1.3));
        cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.t === 'spark') {
        cx.globalAlpha = 0.6 + 0.4 * Math.sin(p.fl * 3);
        cx.beginPath();
        cx.arc(0, 0, p.h * 0.45, 0, 6.28);
        cx.fill();
      } else {
        cx.fillStyle = '#F5CC5C';
        cx.shadowColor = 'rgba(255,210,100,.8)';
        cx.shadowBlur = 10;
        this.coroa(cx, p.w * 1.1);
        cx.fill();
      }
      cx.restore();
    }

    this.particulas = this.particulas.filter((p) => p.y < 1140 && p.x > -60 && p.x < 1980);
    this.raf =
      this.particulas.length || this.chuva ? requestAnimationFrame(() => this.quadro()) : 0;
  }

  private coroa(cx: CanvasRenderingContext2D, s: number): void {
    cx.beginPath();
    cx.moveTo(-s, s * 0.6);
    cx.lineTo(-s * 0.9, -s * 0.5);
    cx.lineTo(-s * 0.4, 0);
    cx.lineTo(0, -s * 0.8);
    cx.lineTo(s * 0.4, 0);
    cx.lineTo(s * 0.9, -s * 0.5);
    cx.lineTo(s, s * 0.6);
    cx.closePath();
  }
}
