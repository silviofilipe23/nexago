import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent, type PanelIconName } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

interface LibraryFolder {
  icon: PanelIconName;
  label: string;
  count: number;
}

const FOLDERS: LibraryFolder[] = [
  { icon: 'chat', label: 'Vídeos', count: 38 },
  { icon: 'clipboard', label: 'Exercícios', count: 54 },
  { icon: 'folder', label: 'PDFs', count: 21 },
  { icon: 'clipboard', label: 'Treinos', count: 42 },
  { icon: 'folder', label: 'Planilhas', count: 12 },
  { icon: 'chat', label: 'Links', count: 9 },
];

/** Biblioteca (protótipo TrBibliotecaScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-biblioteca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Biblioteca" subtitle="Materiais da equipe">
        <button type="button" class="co-mini-btn co-mini-btn-primary">
          <co-icon name="plus" [size]="14" />
          Enviar arquivo
        </button>
      </co-page-header>

      <div class="body">
        <div class="grid">
          @for (f of folders; track f.label) {
            <co-panel-card pad="lg" class="folder-card">
              <div class="folder-icon">
                <co-icon [name]="f.icon" [size]="22" />
              </div>
              <div class="folder-label">{{ f.label }}</div>
              <div class="folder-count">{{ f.count }} itens</div>
            </co-panel-card>
          }
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 14px;
    }
    .folder-card {
      align-items: center;
      text-align: center;
      gap: 10px;
    }
    .folder-icon {
      width: 46px;
      height: 46px;
      border-radius: 13px;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
      margin: 0 auto;
    }
    .folder-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      margin-top: 10px;
    }
    .folder-count {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
  `,
})
export class PanelBibliotecaComponent {
  protected readonly folders = FOLDERS;
}
