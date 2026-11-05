import { collection, getDocs, limit, query } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';
import { BLOG_DEFAULT_CATEGORIES, mergeBlogCategories, type BlogCategoryView } from '../blog/categories';

/** O servidor aceita até 30 categorias com doc; a folga cobre docs a mais sem custo relevante. */
const MAX_DOCS = 40;

/**
 * Lista efetiva de categorias do blog (`blogCategories`, leitura pública, mesclada com as 6 de origem
 * em `lib/blog/categories.ts`). Nunca lança: se a leitura falhar, volta só às de origem.
 */
export async function getBlogCategories(): Promise<BlogCategoryView[]> {
  try {
    const snap = await getDocs(query(collection(liteDb, 'blogCategories'), limit(MAX_DOCS)));
    return mergeBlogCategories(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
  } catch (err) {
    console.error('[blog] getBlogCategories failed:', err);
    return [...BLOG_DEFAULT_CATEGORIES];
  }
}
