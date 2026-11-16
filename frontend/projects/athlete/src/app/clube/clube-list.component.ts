import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { ClubePartnerLogoComponent } from './clube-partner-logo.component';
import {
  CATEGORY_LABELS,
  brandTextTone,
  categoriesOf,
  categoryLine,
  isLocked,
  lockLabel,
  parseClubSource,
  partnersInCategory,
  type PartnerCategory,
} from './clube.logic';
import { ClubStore } from './data/clube.store';

/** `/clube`: banner do patrocinador oficial, chips de categoria e a grade de parceiros. */
@Component({
  selector: 'app-clube-list',
  imports: [RouterLink, AtPanelShellComponent, ClubePartnerLogoComponent],
  templateUrl: './clube-list.component.html',
  styleUrl: './clube-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubeListComponent {
  protected readonly store = inject(ClubStore);

  /** Por onde a pessoa entrou no clube; acompanha a visita inteira (vai junto no link do parceiro). */
  protected readonly source = parseClubSource(inject(ActivatedRoute).snapshot.queryParamMap.get('origem'));
  protected readonly linkQuery = { origem: this.source };

  protected readonly labels = CATEGORY_LABELS;
  protected readonly categoryLine = categoryLine;
  protected readonly isLocked = isLocked;
  protected readonly lockLabel = lockLabel;
  protected readonly selected = signal<PartnerCategory | null>(null);

  protected readonly categories = computed(() => categoriesOf(this.store.partners()));
  /** A categoria escolhida pode sumir numa releitura; aí volta para "Todos". */
  protected readonly activeCategory = computed(() => {
    const chosen = this.selected();
    return chosen && this.categories().includes(chosen) ? chosen : null;
  });
  protected readonly shown = computed(() => partnersInCategory(this.store.partners(), this.activeCategory()));
  protected readonly sponsorDarkText = computed(() => {
    const sponsor = this.store.sponsor();
    return !!sponsor && brandTextTone(sponsor.brandColor) === 'dark';
  });

  private viewTracked = false;

  constructor() {
    this.store.ensureLoaded();
    // `club_view` uma vez por visita, só com a vitrine de fato aberta para a pessoa.
    effect(() => {
      if (this.viewTracked || this.store.loading() || this.store.error() || this.store.closed()) return;
      this.viewTracked = true;
      untracked(() => this.store.track('club_view', this.source));
    });
  }

  protected selectCategory(category: PartnerCategory | null): void {
    this.selected.set(category);
  }

  protected retry(): void {
    void this.store.reload();
  }
}
