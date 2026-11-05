import { Injectable } from '@angular/core';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import {
  authorFromDoc,
  categoryFromDoc,
  type BlogAuthorDef,
  type BlogCategoryDef,
  type SaveBlogAuthorInput,
  type SaveBlogCategoryInput,
} from './blog-taxonomy';

/**
 * `blogCategories` e `blogAuthors`: leitura pública direto do Firestore (poucos docs: até 30 categorias
 * e o time de autores); escrita só pelas callables `saveBlogCategory`/`saveBlogAuthor`.
 */
@Injectable({ providedIn: 'root' })
export class BlogTaxonomyRepository {
  /** Só os docs; a lista efetiva (com as de origem) é `effectiveCategories`. */
  async categoryDocs(): Promise<BlogCategoryDef[]> {
    const snap = await getDocs(collection(backofficeDb(), 'blogCategories'));
    return snap.docs.map((d) => categoryFromDoc(d.id, d.data())).filter((c): c is BlogCategoryDef => c !== null);
  }

  async authors(): Promise<BlogAuthorDef[]> {
    const snap = await getDocs(collection(backofficeDb(), 'blogAuthors'));
    return snap.docs.map((d) => authorFromDoc(d.id, d.data()));
  }

  async saveCategory(input: SaveBlogCategoryInput): Promise<{ id: string }> {
    const r = await httpsCallable<SaveBlogCategoryInput, { id: string }>(backofficeFunctions(), 'saveBlogCategory')(input);
    return r.data;
  }

  async saveAuthor(input: SaveBlogAuthorInput): Promise<{ id: string }> {
    const r = await httpsCallable<SaveBlogAuthorInput, { id: string }>(backofficeFunctions(), 'saveBlogAuthor')(input);
    return r.data;
  }
}
