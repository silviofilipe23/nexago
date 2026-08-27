import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const COLUMNS: FooterColumn[] = [
  {
    title: 'Plataforma',
    links: [
      { label: 'Como funciona', href: '/#como-funciona' },
      { label: 'Ligas nexaGO', href: '/ligas' },
      { label: 'Rankings', href: '/rankings' },
      { label: 'Torneios', href: '/torneios' },
      { label: 'Blog', href: '/blog' },
      { label: 'Baixar o app', href: 'https://linktr.ee/nexago', external: true },
    ],
  },
  {
    title: 'Para você',
    links: [
      { label: 'Atletas', href: 'https://linktr.ee/nexago', external: true },
      { label: 'Organizadores', href: '/organizadores' },
      { label: 'Arenas', href: '/arenas' },
    ],
  },
  {
    title: 'nexaGO',
    links: [
      { label: 'Sobre', href: '/sobre' },
      { label: 'Ajuda', href: '/ajuda' },
      { label: 'Privacidade', href: '/privacidade' },
      { label: 'Termos de uso', href: '/termos' },
      { label: 'Contato', href: '/contato' },
    ],
  },
];

@Component({
  selector: 'app-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './site-footer.html',
})
export class SiteFooter {
  protected readonly columns = COLUMNS;
  protected readonly year = new Date().getFullYear();
}
