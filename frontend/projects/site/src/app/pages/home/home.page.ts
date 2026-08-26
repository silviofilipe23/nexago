import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CinematicHero } from './sections/cinematic-hero';
import { FeaturesSection } from './sections/features';
import { ComoFunciona } from './sections/como-funciona';
import { StatsSection } from './sections/stats';
import { TorneiosDestaqueSection } from './sections/torneios-destaque';
import { ArenasCarouselSection } from './sections/arenas-carousel';
import { LigaSection } from './sections/liga';
import { FaqSection } from './sections/faq';
import { WaitlistSection } from './sections/waitlist';
import { DownloadSection } from './sections/download';

/**
 * Porta de `app/page.tsx` (site Next.js) — mesma composição e ordem da fonte. `ProvaSocial`
 * fica de fora de propósito: está comentada na fonte (`{/* <ProvaSocial /> * /}`), não é
 * dead code nosso. `Hero`/`Steps` não aparecem aqui — não fazem parte da home real (ver
 * relatório da migração: `Hero` é código morto na fonte, `Steps` só roda em /arenas,
 * /ligas, /organizadores). Torneios/arenas usam dados placeholder — leitura Firestore ao
 * vivo é uma fase posterior da migração.
 */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CinematicHero,
    FeaturesSection,
    ComoFunciona,
    StatsSection,
    TorneiosDestaqueSection,
    ArenasCarouselSection,
    LigaSection,
    FaqSection,
    WaitlistSection,
    DownloadSection,
  ],
  host: { class: 'block overflow-x-hidden' },
  template: `
    <app-cinematic-hero />
    <app-features />
    <app-como-funciona />
    <app-stats />
    <app-torneios-destaque-section />
    <app-arenas-carousel-section
      eyebrow="Onde a areia acontece"
      title="Arenas pra jogar perto de você"
      description="Conheça as arenas que já fazem parte do nexaGO — encontre onde jogar, treinar e competir."
    />
    <app-liga />
    <app-faq />
    <app-waitlist-section />
    <app-download-section />
  `,
})
export class HomePage {
  constructor() {
    inject(Title).setTitle('nexaGO — Torneios, ranking e ligas de beach tennis e vôlei de praia');
  }
}
