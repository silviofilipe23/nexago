import { LinkManagerComponent, type LinkSuggestion } from '@nexago/link-pages';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { organizerFirestore } from '../data/firestore';
import { organizerFunctions } from '../data/functions';
import type { OrganizerTournament } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Tela Links do portal do organizador: a página pública `/o/{slug}` do site.
 *
 *  Mesma gestão do painel da arena (`nx-link-manager`, em `@nexago/link-pages`) — o que muda
 *  aqui é o dono (o próprio uid do organizador, já que não existe doc de organização) e as
 *  sugestões, que saem dos torneios com inscrições abertas. */
@Component({
  selector: 'og-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgIconComponent, LinkManagerComponent],
  template: `
    <og-page-header title="Links" subtitle="Sua página pública de links">
      <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="createLink()">
        <og-icon name="plus" [size]="14" />
        Novo link
      </button>
    </og-page-header>

    <nx-link-manager
      [db]="db"
      [functions]="functions"
      ownerType="organizer"
      [ownerId]="uid()"
      [defaultTitle]="defaultTitle()"
      [publicBaseUrl]="publicBaseUrl"
      [suggestions]="suggestions()"
    />
  `,
  styles: `
    /* O gerenciador faz aqui o papel do .og-content (é ele que rola, e já nasce com
       flex: 1 + min-height: 0 + overflow: auto), mas o padding dele é o da arena — o outro
       portal que usa a lib, cujos breakpoints são 1180/720 e não têm o 1024 daqui. Sem este
       recorte a tela Links ficava com 32px de lateral no celular contra os 20px de todas as
       outras telas do painel, e os cards saíam 12px fora do prumo do cabeçalho.
       O ajuste mora no consumidor de propósito: mudar a lib mexeria na arena junto. */
    @media (max-width: 1023.98px) {
      nx-link-manager {
        padding: 16px 20px 24px;
      }
    }
  `,
})
export class LinksComponent {
  private readonly auth = inject(AuthService);
  /** O gerenciador é irmão do cabeçalho, mas a consulta por view evita depender da ordem
   *  do template caso a tela ganhe estados condicionais. */
  private readonly manager = viewChild(LinkManagerComponent);

  protected readonly db = organizerFirestore();
  protected readonly functions = organizerFunctions();
  protected readonly publicBaseUrl = environment.publicSiteUrl;

  protected readonly uid = computed(() => this.auth.user()?.uid ?? null);

  protected readonly defaultTitle = computed(
    () => this.auth.displayName() ?? this.auth.user()?.email?.split('@')[0] ?? 'Organizador',
  );

  private readonly tournaments = signal<OrganizerTournament[]>([]);

  /** Torneios que ainda vão acontecer viram atalho de link — é o que o organizador mais
   *  divulga. Falha de leitura só significa "sem sugestões", nunca quebra a tela. */
  protected readonly suggestions = computed<LinkSuggestion[]>(() => {
    const base = this.publicBaseUrl;
    return this.tournaments()
      .filter((t) => t.status === 'inscricoes' || t.status === 'andamento')
      .slice(0, 4)
      .map((t) => ({
        label: t.name,
        title: t.name,
        subtitle: t.status === 'andamento' ? 'Acontecendo agora' : 'Inscrições abertas',
        url: `${base}/torneios/${t.id}`,
        icon: t.status === 'andamento' ? 'trophy' : 'ticket',
      }));
  });

  constructor() {
    effect(() => {
      const uid = this.uid();
      if (!uid) return;
      void this.loadTournaments(uid);
    });
  }

  protected createLink(): void {
    this.manager()?.openCreate();
  }

  private async loadTournaments(uid: string): Promise<void> {
    try {
      this.tournaments.set(await listMyTournaments(uid));
    } catch {
      this.tournaments.set([]);
    }
  }
}
