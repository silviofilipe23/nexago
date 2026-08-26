import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { SpotlightCardDirective } from './spotlight-card.directive';

interface SobreValue {
  icon: 'waves' | 'users' | 'flag';
  title: string;
  description: string;
}

const VALUES: SobreValue[] = [
  {
    icon: 'waves',
    title: 'A areia em primeiro lugar',
    description:
      'Cada decisão de produto nasce de quem vive a quadra — do primeiro saque do iniciante ao match point do Open.',
  },
  {
    icon: 'users',
    title: 'Comunidade que joga junto',
    description:
      'Atletas, organizadores e arenas no mesmo lugar. Quando a comunidade cresce, a temporada inteira ganha.',
  },
  {
    icon: 'flag',
    title: 'Circuito de verdade',
    description:
      'Etapas, pontuação acumulada e ranking nacional. A Liga nexaGO transforma jogos avulsos em uma jornada.',
  },
];

/**
 * Porta de `SobrePage` (site Next.js). `metadata.title` era 'Sobre o nexaGO', com o
 * template do layout raiz ('%s · nexaGO') aplicado por cima — daí o título final.
 */
@Component({
  selector: 'app-sobre-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, SpotlightCardDirective],
  templateUrl: './sobre.page.html',
})
export class SobrePage {
  protected readonly values = VALUES;

  private readonly titleService = inject(Title);

  constructor() {
    this.titleService.setTitle('Sobre o nexaGO · nexaGO');
  }
}
