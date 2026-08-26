import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';

interface TocSection {
  id: string;
  title: string;
}

// TODO: revisar com o jurídico antes de publicar (remover o aviso de rascunho ao final).
const LAST_UPDATE = '29 de junho de 2026';
const CONTACT_EMAIL = 'contato@nexago.com.br';
const COMPANY = 'Nrs Desenvolvimento De Programas De Computador Sob Encomenda Ltda';
const CNPJ = '66.753.240/0001-75';
const ADDRESS = 'Rua Pais Leme, 215, Conj 1713, Pinheiros, São Paulo, SP, 05424-150';

const SECTIONS: TocSection[] = [
  { id: 'aceitacao', title: '1. Aceitação dos termos' },
  { id: 'definicoes', title: '2. Definições' },
  { id: 'cadastro', title: '3. Elegibilidade e cadastro' },
  { id: 'conta', title: '4. Sua conta e responsabilidades' },
  { id: 'uso', title: '5. Regras de uso da plataforma' },
  { id: 'pagamentos', title: '6. Inscrições, pagamentos e reembolsos' },
  { id: 'eventos', title: '7. Torneios, ligas e resultados' },
  { id: 'conteudo', title: '8. Conteúdo do usuário' },
  { id: 'propriedade', title: '9. Propriedade intelectual' },
  { id: 'encerramento', title: '10. Suspensão e encerramento' },
  { id: 'responsabilidade', title: '11. Limitação de responsabilidade' },
  { id: 'alteracoes', title: '12. Alterações dos termos' },
  { id: 'foro', title: '13. Lei aplicável e foro' },
  { id: 'contato', title: '14. Contato' },
];

/** Porta de `TermosPage` (site Next.js). Conteúdo estático, sem interatividade. */
@Component({
  selector: 'app-termos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, RouterLink],
  templateUrl: './termos.page.html',
})
export class TermosPage {
  protected readonly sections = SECTIONS;
  protected readonly lastUpdate = LAST_UPDATE;
  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly company = COMPANY;
  protected readonly cnpj = CNPJ;
  protected readonly address = ADDRESS;

  private readonly titleService = inject(Title);

  constructor() {
    this.titleService.setTitle('Termos de Uso · nexaGO');
  }
}
