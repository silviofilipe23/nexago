import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { HOME_IMAGE_LOADER } from '../../../lib/home-images';
import { Opening } from './sections/opening';
import { SportsTicker } from './sections/sports-ticker';
import { MatchPoint } from './sections/match-point';
import { BookingScene } from './sections/booking-scene';
import { GameDay } from './sections/game-day';
import { AthleteScene } from './sections/athlete-scene';
import { OrganizerScene } from './sections/organizer-scene';
import { NumbersSection } from './sections/numbers';
import { AcompanhandoSection } from './sections/acompanhando';
import { TorneiosDestaqueSection } from './sections/torneios-destaque';
import { ArenasCarouselSection } from './sections/arenas-carousel';
import { AudienceDoors } from './sections/audience-doors';
import { FaqSection } from './sections/faq';
import type { QA } from './sections/faq-accordion';
import { FinalCall } from './sections/final-call';
import { StickyDownload } from './sections/sticky-download';

const HOME_FAQ: QA[] = [
  {
    q: 'O app é gratuito?',
    a: 'Sim. Baixar o nexaGO e criar seu perfil de atleta é grátis. Você paga só o que decidir usar: a reserva de uma quadra ou a inscrição de um torneio.',
  },
  {
    q: 'Quais esportes posso jogar?',
    a: 'Vôlei de praia, futevôlei, beach tennis, tênis, padel e vôlei de quadra têm torneios, placar e ranking. Futebol, basquete e corrida já entram no seu perfil, e a lista segue crescendo.',
  },
  {
    q: 'Como reservo uma quadra?',
    a: 'No app, escolha o esporte, o dia e o horário, veja as arenas com vaga perto de você e pague por ali mesmo. A reserva aparece na sua agenda na hora.',
  },
  {
    q: 'Como me inscrevo em um torneio?',
    a: 'Abra o torneio no app, escolha a categoria, convide sua dupla ou equipe e pague a inscrição ali mesmo. Depois é acompanhar a chave e os horários dos seus jogos.',
  },
  {
    q: 'Como funciona o ranking?',
    a: 'Cada torneio soma pontos conforme a fase que você alcança e o peso da categoria. O ranking é separado por esporte, e a tela "Como funciona" do app mostra a conta inteira.',
  },
  {
    q: 'Organizo torneios ou tenho uma arena. Tem algo para mim?',
    a: 'Tem. Organizadores criam torneios, recebem inscrições e geram as chaves pelo painel; arenas ganham agenda online, reservas pagas e página própria. As duas portas estão logo acima.',
  },
];

/**
 * Home "Dia de jogo": abertura em vídeo, duas cenas jogadas pela rolagem (o match point e a
 * reserva de uma quadra), o dia em três horários, uma terceira cena que fecha o dia com o que
 * fica para o atleta, uma quarta com o mesmo torneio visto por quem organiza, os números do
 * nexaGO, o que está acontecendo de verdade (torneios e arenas do Firestore) e o download. Tudo que anima com ScrollTrigger vem antes das seções que carregam dados — assim a
 * altura que elas ganham ao chegar não desloca nenhum gatilho.
 */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Opening,
    SportsTicker,
    MatchPoint,
    BookingScene,
    GameDay,
    AthleteScene,
    OrganizerScene,
    NumbersSection,
    AcompanhandoSection,
    TorneiosDestaqueSection,
    ArenasCarouselSection,
    AudienceDoors,
    FaqSection,
    FinalCall,
    StickyDownload,
  ],
  providers: [HOME_IMAGE_LOADER],
  host: { class: 'nx-home block overflow-x-clip' },
  template: `
    <app-opening />
    <app-sports-ticker />
    <app-match-point />
    <app-booking-scene />
    <app-game-day />
    <app-athlete-scene />
    <app-organizer-scene />
    <app-numbers />
    <app-acompanhando-section />
    <app-torneios-destaque-section />
    <app-arenas-carousel-section
      eyebrow=""
      title="Arenas para jogar perto de você"
      description="Conheça as arenas que já estão no nexaGO: veja as quadras, os esportes e reserve seu horário pelo app."
    />
    <app-audience-doors />
    <app-faq [items]="faq" eyebrow="" title="Antes de entrar em quadra" />
    <app-final-call />
    <app-sticky-download />
  `,
})
export class HomePage {
  protected readonly faq = HOME_FAQ;

  constructor() {
    inject(Title).setTitle('nexaGO — Reserve quadras, jogue torneios e suba no ranking');
  }
}
