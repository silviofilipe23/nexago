import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
  viewChildren,
} from '@angular/core';
import gsap from 'gsap';

import type { RankEntry } from './data/ranking.mock';
import { MOCK_RANKING, VIEWER_RANKING_HIGHLIGHT } from './data/ranking.mock';
import { registerGsapPlugins, prefersReducedMotion, scheduleScrollTriggerRefresh } from './animations/gsap-setup';

@Component({
  selector: 'app-landing-ranking',
  standalone: true,
  templateUrl: './landing-ranking.component.html',
  styleUrl: './landing-ranking.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingRankingComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly ranking = MOCK_RANKING;
  readonly topThree = MOCK_RANKING.filter((e) => e.rank <= 3);
  readonly rest = MOCK_RANKING.filter((e) => e.rank > 3);
  readonly viewerHighlight = VIEWER_RANKING_HIGHLIGHT;

  private readonly leaderPoints = MOCK_RANKING[0]?.points ?? 1;

  private readonly sectionRef = viewChild.required<ElementRef<HTMLElement>>('rankSection');
  private readonly podiumRefs = viewChildren<ElementRef<HTMLElement>>('podium');
  private readonly rowRefs = viewChildren<ElementRef<HTMLElement>>('rankRow');

  constructor() {
    afterNextRender(() => {
      registerGsapPlugins();
      const section = this.sectionRef().nativeElement;
      const podiumEls = this.podiumRefs().map((r) => r.nativeElement);
      const rowEls = this.rowRefs().map((r) => r.nativeElement);
      if (prefersReducedMotion()) {
        gsap.set([...podiumEls, ...rowEls], { opacity: 1, scale: 1, x: 0 });
        return;
      }

      const rowGlowCleanups: Array<() => void> = [];
      for (const row of rowEls) {
        const onMove = (e: PointerEvent): void => {
          const r = row.getBoundingClientRect();
          row.style.setProperty('--rank-glow-x', `${e.clientX - r.left}px`);
          row.style.setProperty('--rank-glow-y', `${e.clientY - r.top}px`);
        };
        const onLeave = (): void => {
          row.style.removeProperty('--rank-glow-x');
          row.style.removeProperty('--rank-glow-y');
        };
        row.addEventListener('pointermove', onMove, { passive: true });
        row.addEventListener('pointerleave', onLeave);
        rowGlowCleanups.push(() => {
          row.removeEventListener('pointermove', onMove);
          row.removeEventListener('pointerleave', onLeave);
        });
      }

      const ctx = gsap.context(() => {
        if (podiumEls.length > 0) {
          gsap.from(podiumEls, {
            scale: 0.88,
            opacity: 0,
            duration: 0.5,
            stagger: 0.1,
            ease: 'back.out(1.4)',
            immediateRender: false,
            scrollTrigger: {
              trigger: section,
              start: 'top 75%',
              toggleActions: 'play none none none',
            },
          });
        }
        if (rowEls.length > 0) {
          gsap.from(rowEls, {
            x: -24,
            opacity: 0,
            duration: 0.45,
            stagger: 0.06,
            ease: 'power2.out',
            immediateRender: false,
            scrollTrigger: {
              trigger: section,
              start: 'top 68%',
              toggleActions: 'play none none none',
            },
          });
        }
      }, section);
      this.destroyRef.onDestroy(() => {
        for (const d of rowGlowCleanups) {
          d();
        }
        ctx.revert();
      });
      scheduleScrollTriggerRefresh();
    });
  }

  trendLabel(t: 'up' | 'same' | 'down'): string {
    if (t === 'up') {
      return 'Em alta';
    }
    if (t === 'down') {
      return 'Em queda';
    }
    return 'Estável';
  }

  trendArrow(t: 'up' | 'same' | 'down'): string {
    if (t === 'up') {
      return '↑';
    }
    if (t === 'down') {
      return '↓';
    }
    return '→';
  }

  trendClass(t: 'up' | 'same' | 'down'): string {
    if (t === 'up') {
      return 'text-emerald-400';
    }
    if (t === 'down') {
      return 'text-rose-400';
    }
    return 'text-slate-400';
  }

  podiumProgressPct(entry: RankEntry): number {
    return Math.min(100, Math.round((entry.points / this.leaderPoints) * 100));
  }

  podiumBadgeClass(rank: number): string {
    const base =
      'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold bg-gradient-to-br ';
    if (rank === 1) {
      return base + 'from-violet-400 to-violet-600 text-white';
    }
    if (rank === 2) {
      return base + 'from-slate-300 to-slate-500 text-nexago-bg';
    }
    return base + 'from-amber-700 to-amber-900 text-white';
  }
}
