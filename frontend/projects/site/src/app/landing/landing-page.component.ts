import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LandingArenaScheduleComponent } from './landing-arena-schedule.component';
import { LandingArenaSearchComponent } from './landing-arena-search.component';
import { LandingDifferentiatorsComponent } from './landing-differentiators.component';
import { LandingFinalCtaComponent } from './landing-final-cta.component';
import { LandingFooterComponent } from './landing-footer.component';
import { LandingHeaderComponent } from './landing-header.component';
import { LandingHeroComponent } from './landing-hero.component';
import { LandingHowItWorksComponent } from './landing-how-it-works.component';
import { LandingRankingComponent } from './landing-ranking.component';
import { LandingTournamentsComponent } from './landing-tournaments.component';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [
    LandingHeaderComponent,
    LandingHeroComponent,
    LandingArenaScheduleComponent,
    LandingTournamentsComponent,
    LandingHowItWorksComponent,
    LandingRankingComponent,
    LandingDifferentiatorsComponent,
    LandingFinalCtaComponent,
    LandingFooterComponent,
  ],
  templateUrl: './landing-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {}
