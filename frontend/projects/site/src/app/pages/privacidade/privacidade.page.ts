import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';

interface TocSection {
  id: string;
  title: string;
}

// TODO: revisar com o jurídico e preencher os campos entre [colchetes] antes de publicar.
const LAST_UPDATE = '29 de junho de 2026';
const CONTACT_EMAIL = 'contato@nexago.com.br'; // TODO: confirmar canal oficial

const SECTIONS: TocSection[] = [
  { id: 'controlador', title: '1. Quem é o controlador' },
  { id: 'dados', title: '2. Dados que coletamos' },
  { id: 'uso', title: '3. Como usamos seus dados' },
  { id: 'bases', title: '4. Bases legais' },
  { id: 'compartilhamento', title: '5. Compartilhamento' },
  { id: 'cookies', title: '6. Cookies e tecnologias' },
  { id: 'seguranca', title: '7. Armazenamento e segurança' },
  { id: 'retencao', title: '8. Retenção dos dados' },
  { id: 'direitos', title: '9. Seus direitos' },
  { id: 'internacional', title: '10. Transferência internacional' },
  { id: 'menores', title: '11. Crianças e adolescentes' },
  { id: 'alteracoes', title: '12. Alterações desta política' },
  { id: 'contato', title: '13. Contato e Encarregado (DPO)' },
];

/** Porta de `PrivacidadePage` (site Next.js). Conteúdo estático (LGPD), sem interatividade. */
@Component({
  selector: 'app-privacidade-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, RouterLink],
  templateUrl: './privacidade.page.html',
})
export class PrivacidadePage {
  protected readonly sections = SECTIONS;
  protected readonly lastUpdate = LAST_UPDATE;
  protected readonly contactEmail = CONTACT_EMAIL;

  private readonly titleService = inject(Title);

  constructor() {
    this.titleService.setTitle('Política de Privacidade · nexaGO');
  }
}
