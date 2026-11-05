import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FieldComponent } from '../../../ui/field.component';
import type { BlogAuthorDef } from '../data/blog-taxonomy';
import { initialsOf } from '../data/blog-comments';

export type AuthorChoice = BlogAuthorDef & { inactive: boolean };

/**
 * Autor do post: um dos autores ativos do cadastro (foto, nome e função) ou "Outro (texto livre)",
 * que mostra os campos de nome e função de antes.
 */
@Component({
  selector: 'bo-blog-author-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent, RouterLink],
  template: `
    <div class="group">
      <span class="label">Autor</span>
      <div class="options" role="radiogroup" aria-label="Autor">
        @for (a of choices(); track a.id) {
          <button
            type="button"
            role="radio"
            class="option"
            [class.on]="authorId() === a.id"
            [attr.aria-checked]="authorId() === a.id"
            [disabled]="disabled()"
            (click)="picked.emit(a)"
          >
            @if (a.photoUrl; as src) {
              <img class="avatar" [src]="src" alt="" />
            } @else {
              <span class="avatar initials" aria-hidden="true">{{ initials(a.name) }}</span>
            }
            <span class="who">
              <span class="name">{{ a.name }}{{ a.inactive ? ' (inativo)' : '' }}</span>
              @if (a.role) {
                <span class="role">{{ a.role }}</span>
              }
            </span>
          </button>
        }
        <button
          type="button"
          role="radio"
          class="option free"
          [class.on]="authorId() === null"
          [attr.aria-checked]="authorId() === null"
          [disabled]="disabled()"
          (click)="picked.emit(null)"
        >
          <span class="avatar initials" aria-hidden="true">✎</span>
          <span class="who"><span class="name">Outro (texto livre)</span></span>
        </button>
      </div>
      @if (choices().length === 0) {
        <span class="hint">Nenhum autor cadastrado. <a routerLink="/painel/conteudo/blog/autores">Cadastrar autores</a></span>
      }
    </div>
    @if (authorId() === null) {
      <div class="two">
        <bo-field label="Nome">
          <input class="bo-input" placeholder="Nome" [attr.maxlength]="max()" [value]="name()" [disabled]="disabled()" (input)="textChanged.emit({ authorName: value($event) })" />
        </bo-field>
        <bo-field label="Função">
          <input class="bo-input" placeholder="Equipe nexaGO" [attr.maxlength]="max()" [value]="role()" [disabled]="disabled()" (input)="textChanged.emit({ authorRole: value($event) })" />
        </bo-field>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; }
    .group { display: flex; flex-direction: column; gap: 8px; }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .options { display: flex; flex-direction: column; gap: 4px; max-height: 236px; overflow-y: auto; }
    .option { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .option:hover:not(:disabled) { background: var(--nx-surface-1); }
    .option.on { border-color: rgba(255, 106, 26, 0.55); background: rgba(255, 106, 26, 0.07); }
    .option:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .avatar { flex: none; width: 30px; height: 30px; border-radius: 50%; object-fit: cover; background: var(--nx-surface-2); }
    .avatar.initials { display: grid; place-items: center; font-family: var(--nx-font-display); font-weight: 700; font-size: 11px; color: var(--nx-orange-500); background: var(--nx-orange-tint); }
    .free .avatar.initials { color: var(--nx-text-mute); background: var(--nx-surface-2); }
    .who { display: flex; flex-direction: column; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role { font-size: 11.5px; color: var(--nx-text-dim); }
    .hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .hint a { color: var(--nx-orange-400); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 480px) { .two { grid-template-columns: 1fr; } }
  `,
})
export class BlogAuthorPickerComponent {
  readonly choices = input.required<AuthorChoice[]>();
  readonly authorId = input<string | null>(null);
  readonly name = input('');
  readonly role = input('');
  readonly max = input(40);
  readonly disabled = input(false);

  readonly picked = output<BlogAuthorDef | null>();
  readonly textChanged = output<{ authorName?: string; authorRole?: string }>();

  protected initials(name: string): string {
    return initialsOf(name);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
