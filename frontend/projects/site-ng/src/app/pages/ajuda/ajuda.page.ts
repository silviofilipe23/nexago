import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Renderer2, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { FaqAccordion, type Qa } from './faq-accordion';

interface FaqGroup {
  title: string;
  items: Qa[];
}

const GROUPS: FaqGroup[] = [
  {
    title: 'Geral',
    items: [
      {
        q: 'O que é o nexaGO?',
        a: 'Uma plataforma de gestão e participação em torneios e ligas de esportes de areia (beach tennis e vôlei de praia), conectando atletas, organizadores e arenas.',
      },
      {
        q: 'O app é gratuito?',
        a: 'Sim. Baixar o app e criar seu perfil é gratuito. Você paga apenas a inscrição das etapas em que decidir competir.',
      },
      {
        q: 'Em quais plataformas o app está disponível?',
        a: 'O nexaGO está disponível para iOS e Android.',
      },
    ],
  },
  {
    title: 'Atletas',
    items: [
      {
        q: 'Como me inscrevo em um torneio?',
        a: 'Baixe o app, crie seu perfil e escolha a etapa. A inscrição leva poucos toques e o pagamento é feito no app.',
      },
      {
        q: 'Em qual categoria devo jogar?',
        a: 'Você joga na sua categoria ou acima dela. Cada torneio lista as categorias disponíveis com gênero, nível e vagas.',
      },
      {
        q: 'Como acompanho meu ranking?',
        a: 'Seu ranking e histórico ficam no seu perfil do app, atualizados conforme você participa das etapas.',
      },
    ],
  },
  {
    title: 'Organizadores',
    items: [
      {
        q: 'Como crio um torneio?',
        a: 'Pelo painel do organizador você define esporte, categorias, vagas e taxas, e abre as inscrições em minutos.',
      },
      {
        q: 'O chaveamento é automático?',
        a: 'Sim. Eliminatória simples, dupla e grupos são gerados automaticamente quando as inscrições fecham.',
      },
      {
        q: 'Como vinculo meu torneio à Liga?',
        a: 'Etapas podem compor uma liga com pontuação acumulada e ranking próprio. Fale com a gente para configurar.',
      },
    ],
  },
  {
    title: 'Arenas',
    items: [
      {
        q: 'Como coloco minha arena no nexaGO?',
        a: 'Cadastre o perfil público da arena com fotos, esportes e localização. Veja a página de arenas para começar.',
      },
      {
        q: 'Preciso organizar torneios?',
        a: 'Não. Você pode apenas manter o perfil e a agenda e receber etapas de organizadores quando quiser.',
      },
    ],
  },
  {
    title: 'Pagamentos',
    items: [
      {
        q: 'Como pago a inscrição?',
        a: 'O pagamento é feito diretamente no app, de forma segura, por meio dos provedores de pagamento.',
      },
      {
        q: 'Posso pedir reembolso?',
        a: 'As políticas de cancelamento e reembolso seguem as regras divulgadas em cada etapa pelo organizador e a legislação aplicável.',
      },
    ],
  },
];

/**
 * Porta de `AjudaPage` (site Next.js). O JSON-LD de FAQPage era um `<script>` inline no
 * JSX; aqui é injetado no `<head>` via `Renderer2` (removido no destroy), já que o app é
 * CSR puro — sem SSR, o valor pra crawlers que não executam JS é limitado, mas mantemos
 * a mesma estrutura de dados do original.
 */
@Component({
  selector: 'app-ajuda-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, RouterLink, FaqAccordion],
  templateUrl: './ajuda.page.html',
})
export class AjudaPage {
  protected readonly groups = GROUPS;

  private readonly titleService = inject(Title);
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);

  constructor() {
    this.titleService.setTitle('Central de ajuda · nexaGO');

    const faqJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: GROUPS.flatMap((group) =>
        group.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      ),
    };

    const script = this.renderer.createElement('script');
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.appendChild(script, this.renderer.createText(JSON.stringify(faqJsonLd)));
    this.renderer.appendChild(this.document.head, script);

    inject(DestroyRef).onDestroy(() => this.renderer.removeChild(this.document.head, script));
  }
}
