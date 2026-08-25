import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OgIconComponent, type OgIconName } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';

interface EventFormat {
  icon: OgIconName;
  title: string;
  description: string;
  example: string;
  link: string;
}

/** Textos iguais aos do app (`organizer_create_chooser_page.dart`) — as duas superfícies
 *  explicam o mesmo formato com as mesmas palavras. Fora o selo "MAIS RÁPIDO" do torneio,
 *  que lá justificava a criação expressa logo abaixo; sem ela, só enviesaria a escolha. */
const FORMATS: readonly EventFormat[] = [
  {
    icon: 'trophy',
    title: 'Torneio avulso',
    description: 'Um evento único, normalmente um fim de semana. Categorias, chave e premiação próprias.',
    example: 'Ex: Open Goiânia · 28–30 mar',
    link: '/painel/novo-torneio',
  },
  {
    icon: 'flag',
    title: 'Liga / Circuito',
    description: 'Várias etapas ao longo do ano, com ranking geral somado e uma Grande Final.',
    example: 'Ex: Copa Goiás · 6 etapas',
    link: '/painel/nova-liga',
  },
];

/** Escolha do formato antes de entrar num wizard — o portal tinha os dois wizards prontos
 *  (`/painel/novo-torneio` e `/painel/nova-liga`) mas nenhum lugar que apresentasse a liga
 *  como opção, então quem não sabia que ela existia nunca chegava lá.
 *
 *  Tela estática de propósito: nada aqui lê o Firestore. "Adicionar etapa" aparece mesmo
 *  para quem não tem liga nenhuma — o `/painel/nova-etapa` já carrega as ligas publicadas e
 *  tem seletor próprio, e esconder o link custaria uma leitura só para decidir se mostra. */
@Component({
  selector: 'og-novo-evento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgIconComponent],
  template: `
    <og-page-header title="Novo evento" subtitle="O que você quer criar? Dá pra ajustar tudo depois, antes de publicar." />

    <div class="og-content">
      <div class="og-novo-evento">
        <div class="og-format-grid">
          @for (f of formats; track f.link) {
            <a class="og-format-card" [routerLink]="f.link">
              <span class="og-format-icon"><og-icon [name]="f.icon" [size]="22" [strokeWidth]="1.9" /></span>
              <span class="og-format-body">
                <span class="og-format-title">{{ f.title }}</span>
                <span class="og-format-desc">{{ f.description }}</span>
              </span>
              <span class="og-format-spacer"></span>
              <span class="og-format-foot">
                <span class="og-format-example">{{ f.example }}</span>
                <og-icon name="chevron" [size]="16" [strokeWidth]="1.9" />
              </span>
            </a>
          }
        </div>

        <div class="og-format-sep"><span>Já tem uma liga</span></div>

        <a class="og-format-secondary" routerLink="/painel/nova-etapa">
          <span class="og-format-secondary-icon"><og-icon name="calendar" [size]="18" [strokeWidth]="1.9" /></span>
          <span class="og-format-secondary-label">Adicionar etapa a uma liga existente</span>
          <og-icon name="chevron" [size]="16" [strokeWidth]="1.9" />
        </a>
      </div>
    </div>
  `,
  styles: `
    .og-novo-evento {
      width: 100%;
      max-width: 780px;
      margin: 12px auto 0;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .og-format-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 18px;
    }

    .og-format-card {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 318px;
      padding: 24px;
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      text-decoration: none;
      transition:
        background var(--nx-d-base) var(--nx-ease-out),
        border-color var(--nx-d-base) var(--nx-ease-out),
        box-shadow var(--nx-d-base) var(--nx-ease-out);
    }

    /* A borda laranja + a sombra são a afordância de navegação: sinalizam que o card
       inteiro leva a algum lugar, já que ele não tem botão próprio. */
    .og-format-card:hover,
    .og-format-card:focus-visible {
      background: var(--nx-surface-1);
      border-color: var(--nx-orange-500);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
    }

    .og-format-card:hover .og-format-foot {
      color: var(--nx-text);
    }

    .og-format-icon {
      width: 46px;
      height: 46px;
      flex: none;
      display: grid;
      place-items: center;
      border-radius: var(--nx-r-2);
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .og-format-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .og-format-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.01em;
      color: var(--nx-text);
    }

    .og-format-desc {
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--nx-text-mute);
    }

    .og-format-spacer {
      flex: 1;
    }

    .og-format-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
      transition: color var(--nx-d-base) var(--nx-ease-out);
    }

    .og-format-example {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .og-format-sep {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .og-format-sep::before,
    .og-format-sep::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--nx-line);
    }

    .og-format-sep span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .og-format-secondary {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 18px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
      text-decoration: none;
      transition:
        border-color var(--nx-d-base) var(--nx-ease-out),
        box-shadow var(--nx-d-base) var(--nx-ease-out);
    }

    .og-format-secondary:hover,
    .og-format-secondary:focus-visible {
      border-color: var(--nx-orange-500);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
    }

    .og-format-secondary-icon {
      width: 36px;
      height: 36px;
      flex: none;
      display: grid;
      place-items: center;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
    }

    .og-format-secondary-label {
      flex: 1;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14.5px;
      color: var(--nx-text);
    }

    /* Abaixo do ponto em que os dois cards deixam de caber lado a lado sem espremer o texto. */
    @media (max-width: 900px) {
      .og-format-grid {
        grid-template-columns: 1fr;
      }

      .og-format-card {
        min-height: 0;
      }
    }
  `,
})
export class NovoEventoComponent {
  protected readonly formats = FORMATS;
}
