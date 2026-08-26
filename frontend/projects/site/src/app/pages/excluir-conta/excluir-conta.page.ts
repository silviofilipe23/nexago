import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';

interface TocSection {
  id: string;
  title: string;
}

const LAST_UPDATE = '26 de agosto de 2026';
const CONTACT_EMAIL = 'contato@nexago.com.br';
const COMPANY = 'Nrs Desenvolvimento De Programas De Computador Sob Encomenda Ltda';
const CNPJ = '66.753.240/0001-75';
const ADDRESS = 'Rua Pais Leme, 215, Conj 1713, Pinheiros, São Paulo, SP, 05424-150';

const SECTIONS: TocSection[] = [
  { id: 'sobre', title: '1. Sobre o aplicativo' },
  { id: 'app', title: '2. Excluir pelo aplicativo' },
  { id: 'email', title: '3. Sem acesso ao aplicativo' },
  { id: 'excluidos', title: '4. Dados excluídos' },
  { id: 'retidos', title: '5. Dados mantidos e por quê' },
  { id: 'contato', title: '6. Contato' },
];

/**
 * Porta de `ExcluirContaPage` (site Next.js). Conteúdo 100% estático — instruções de
 * como excluir a conta pelo app ou por e-mail. A fonte NÃO tem formulário, escrita no
 * Firestore, nem chamada de Cloud Function: é só texto legal + passo a passo, então não
 * há nada pendente de "wiring" aqui (ver observação no relatório final da tarefa).
 */
@Component({
  selector: 'app-excluir-conta-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, RouterLink],
  templateUrl: './excluir-conta.page.html',
})
export class ExcluirContaPage {
  protected readonly sections = SECTIONS;
  protected readonly lastUpdate = LAST_UPDATE;
  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly company = COMPANY;
  protected readonly cnpj = CNPJ;
  protected readonly address = ADDRESS;

  private readonly titleService = inject(Title);

  constructor() {
    this.titleService.setTitle('Excluir Conta · nexaGO');
  }
}
