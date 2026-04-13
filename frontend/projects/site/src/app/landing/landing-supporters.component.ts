import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';

import { MotionService } from '../motion/motion.service';
import { APP_LINKS } from './data/links';
import { LANDING_SUPPORTER_TIERS } from './data/supporters.mock';

@Component({
  selector: 'app-landing-supporters',
  standalone: true,
  templateUrl: './landing-supporters.component.html',
  styleUrl: './landing-supporters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingSupportersComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly motion = inject(MotionService);
  private readonly sectionRef = viewChild.required<ElementRef<HTMLElement>>('supSection');

  protected readonly tiers = LANDING_SUPPORTER_TIERS;
  protected readonly links = APP_LINKS;

  constructor() {
    afterNextRender(() => {
      const root = this.sectionRef().nativeElement;
      const header = root.querySelector<HTMLElement>('[data-lsu-header]');
      const tierLabels = [...root.querySelectorAll<HTMLElement>('[data-lsu-tier-label]')];
      const logos = [...root.querySelectorAll<HTMLElement>('[data-lsu-logo]')];
      const ctaBand = root.querySelector<HTMLElement>('[data-lsu-cta]');

      if (!header || logos.length === 0) {
        return;
      }

      const revert = this.motion.attachLandingSupportersAnimations({
        root,
        header,
        tierLabels,
        logos,
        ctaBand,
      });

      this.destroyRef.onDestroy(() => {
        revert();
      });
    });
  }
}
