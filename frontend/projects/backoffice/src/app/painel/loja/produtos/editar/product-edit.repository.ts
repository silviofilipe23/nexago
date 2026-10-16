import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
import { persistable, type PhotoItem } from './product-photos';
import {
  emptyForm,
  formatMoneyInput,
  toSaveInput,
  toVariationsInput,
  type AxisForm,
  type ProductForm,
  type ProductStatusValue,
  type SkuForm,
} from './product-form';

export interface LoadedProduct {
  id: string;
  version: number;
  slug: string;
  form: ProductForm;
  updatedBy: string | null;
  /** Primeira foto, só para a prévia. */
  coverUrl: string | null;
  photos: PhotoItem[];
}

type Raw = Record<string, any>;

/** Documento → formulário. Tolerante a campo ausente: o doc pode vir de uma versão anterior. */
export function formFromDocs(data: Raw, skus: Raw[], costCents: number | null): ProductForm {
  const base = emptyForm();
  const axes: AxisForm[] = (data['axes'] ?? []).map((axis: Raw) => ({
    id: axis['id'],
    label: axis['label'] ?? axis['id'],
    values: (axis['values'] ?? []).map((v: Raw) => ({ id: v['id'], label: v['label'] ?? v['id'], hex: v['hex'] ?? '' })),
  }));
  const skuForms: SkuForm[] = skus.map((sku) => ({
    axisValues: sku['axisValues'] ?? {},
    barcode: sku['barcode'] ?? '',
    price: formatMoneyInput(sku['priceCents'] ?? null),
    stockByLocation: sku['stockByLocation'] ?? {},
  }));
  const shipping = data['shipping'] as Raw | null | undefined;
  return {
    ...base,
    name: data['name'] ?? '',
    baseSku: data['baseSku'] ?? '',
    category: data['category'] ?? '',
    collection: data['collection'] ?? '',
    brand: data['brand'] ?? 'NexaGO',
    description: data['description'] ?? '',
    technicalDetails: data['technicalDetails'] ?? [],
    badge: data['badge'] ?? '',
    price: formatMoneyInput(data['priceCents'] ?? null),
    compareAtPrice: formatMoneyInput(data['compareAtPriceCents'] ?? null),
    cost: formatMoneyInput(costCents),
    channels: data['channels'] ?? base.channels,
    fulfillment: data['fulfillment'] ?? base.fulfillment,
    featured: data['featured'] ?? false,
    weightKg: shipping ? String(shipping['weightGrams'] / 1000).replace('.', ',') : '',
    lengthCm: shipping ? String(shipping['lengthCm']) : '',
    widthCm: shipping ? String(shipping['widthCm']) : '',
    heightCm: shipping ? String(shipping['heightCm']) : '',
    lowStockThreshold: data['lowStockThreshold'] ?? 3,
    status: (data['status'] ?? 'rascunho') as ProductStatusValue,
    active: data['active'] ?? false,
    axes,
    skus: skuForms.length > 0 ? skuForms : base.skus,
  };
}

function updatedByName(data: Raw): string | null {
  const by = data['updatedBy'] as Raw | undefined;
  return by?.['name'] ?? null;
}

/** Leitura direto do Firestore; escrita só pelas callables do catálogo. */
@Injectable({ providedIn: 'root' })
export class ProductEditRepository {
  async load(id: string): Promise<LoadedProduct | null> {
    const db = backofficeDb();
    const ref = doc(db, 'storeProducts', id);
    const [snap, skusSnap, costSnap] = await Promise.all([
      getDoc(ref),
      getDocs(collection(ref, 'skus')),
      getDoc(doc(db, 'storeProductCosts', id)),
    ]);
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data() as Raw;
    const skus = skusSnap.docs.map((d) => d.data() as Raw);
    const cost = costSnap.exists() ? ((costSnap.data() as Raw)['costCents'] as number) : null;
    return {
      id,
      version: data['version'] ?? 0,
      slug: data['slug'] ?? '',
      form: formFromDocs(data, skus, cost),
      updatedBy: updatedByName(data),
      coverUrl: data['photos']?.[0]?.url ?? null,
      photos: ((data['photos'] ?? []) as Raw[]).map((p) => ({
        id: p['id'],
        url: p['url'],
        path: p['path'] ?? '',
        colorValueId: p['colorValueId'] ?? null,
        view: p['view'] === 'frente' || p['view'] === 'costas' ? p['view'] : null,
        progress: null,
        error: null,
      })),
    };
  }

  /** Versão atual no servidor, para o banner de conflito. */
  async peekVersion(id: string): Promise<{ version: number; updatedBy: string | null } | null> {
    const snap = await getDoc(doc(backofficeDb(), 'storeProducts', id));
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data() as Raw;
    return { version: data['version'] ?? 0, updatedBy: updatedByName(data) };
  }

  /**
   * Salva os dados do produto e, se houver variações para gravar, a grade.
   * São duas callables em sequência: a segunda usa a versão devolvida pela primeira.
   */
  async save(
    form: ProductForm,
    meta: { productId: string | null; version: number | null },
    status: ProductStatusValue,
    options: { includeCost: boolean; saveVariations: boolean },
  ): Promise<{ productId: string; version: number; slug: string }> {
    const fn = backofficeFunctions();
    const product = await httpsCallable<unknown, { productId: string; version: number; slug: string }>(
      fn,
      'saveStoreProduct',
    )(toSaveInput(form, meta, status, options));
    let { productId, version, slug } = product.data;
    if (options.saveVariations) {
      const result = await httpsCallable<unknown, { version: number }>(fn, 'saveStoreProductVariations')(
        toVariationsInput(form, productId, version),
      );
      version = result.data.version;
    }
    return { productId, version, slug };
  }

  async archive(id: string, version: number, restore = false): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'archiveStoreProduct')({ productId: id, version, restore });
  }

  async duplicate(id: string): Promise<string> {
    const result = await httpsCallable<unknown, { productId: string }>(
      backofficeFunctions(),
      'duplicateStoreProduct',
    )({ productId: id });
    return result.data.productId;
  }

  /** Sobe o arquivo ao Storage; `onProgress` recebe 0–100. */
  async uploadPhoto(
    productId: string,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<{ id: string; url: string; path: string }> {
    const id = crypto.randomUUID();
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `store/products/${productId}/${id}.${ext}`;
    const task = uploadBytesResumable(storageRef(backofficeStorage(), path), file, { contentType: file.type });
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        () => resolve(),
      );
    });
    return { id, url: await getDownloadURL(task.snapshot.ref), path };
  }

  /** Registra a galeria no produto e devolve a nova versão. */
  async savePhotos(productId: string, version: number, photos: PhotoItem[]): Promise<number> {
    const result = await httpsCallable<unknown, { version: number }>(backofficeFunctions(), 'saveStoreProductPhotos')({
      productId,
      version,
      photos: persistable(photos),
    });
    return result.data.version;
  }

  /** Apaga o arquivo; falha aqui não importa, o produto já não aponta para ele. */
  async deletePhotoFile(path: string): Promise<void> {
    try {
      await deleteObject(storageRef(backofficeStorage(), path));
    } catch {
      // arquivo órfão é aceitável
    }
  }
}
