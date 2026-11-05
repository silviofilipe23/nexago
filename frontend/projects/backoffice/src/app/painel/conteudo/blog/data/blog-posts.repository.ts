import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
import { blogPostFromDoc, type BlogPost, type SaveBlogPostInput, type SaveBlogPostResult } from './blog-post';

/**
 * Admin lê `blogPosts` direto do Firestore (as rules deixam); escrita só pelas callables
 * `saveBlogPost` / `deleteBlogPost` (`functions/src/blog.ts`), que mantêm a reserva do endereço.
 */
@Injectable({ providedIn: 'root' })
export class BlogPostsRepository {
  async list(): Promise<BlogPost[]> {
    const snap = await getDocs(collection(backofficeDb(), 'blogPosts'));
    return snap.docs.map((d) => blogPostFromDoc(d.id, d.data()));
  }

  async get(id: string): Promise<BlogPost | null> {
    const snap = await getDoc(doc(backofficeDb(), 'blogPosts', id));
    return snap.exists() ? blogPostFromDoc(snap.id, snap.data()) : null;
  }

  async save(input: SaveBlogPostInput): Promise<SaveBlogPostResult> {
    const r = await httpsCallable<SaveBlogPostInput, SaveBlogPostResult>(backofficeFunctions(), 'saveBlogPost')(input);
    return r.data;
  }

  async delete(id: string): Promise<void> {
    await httpsCallable<{ id: string }, unknown>(backofficeFunctions(), 'deleteBlogPost')({ id });
  }

  /**
   * Sobe capa ou imagem do corpo ao Storage (`blog/`, leitura pública); `onProgress` recebe 0–100.
   * O arquivo antigo não é apagado: o app e o site podem ainda tê-lo em cache.
   */
  async uploadImage(file: File, onProgress: (percent: number) => void): Promise<string> {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `blog/${crypto.randomUUID()}.${ext}`;
    const task = uploadBytesResumable(storageRef(backofficeStorage(), path), file, { contentType: file.type });
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        () => resolve(),
      );
    });
    return getDownloadURL(task.snapshot.ref);
  }
}
