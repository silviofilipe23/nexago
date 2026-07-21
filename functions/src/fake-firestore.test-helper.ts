import {Timestamp} from "firebase-admin/firestore";

/**
 * Firestore fake em memória para testes de unidade — implementa apenas o que
 * os módulos de rating/ranking usam: doc get/set (merge profundo), collection
 * add/doc, queries `where` (igualdade e array-contains) + `orderBy` +
 * `startAfter`/`limit`, e transações sequenciais.
 *
 * O sufixo `.test-helper.ts` fica fora do glob `lib/**​/*.test.js` do harness.
 */

export type DocData = Record<string, unknown>;

function isPlainObject(value: unknown): value is DocData {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function mergeDeep(target: DocData, source: DocData): DocData {
  const out: DocData = {...target};
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeDeep(out[key] as DocData, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function orderValue(raw: unknown): number | string {
  if (raw instanceof Timestamp) return raw.toMillis();
  if (typeof raw === "number") return raw;
  return String(raw ?? "");
}

export class FakeFirestore {
  store = new Map<string, DocData>();
  private autoIdSeq = 0;

  private nextAutoId(): string {
    this.autoIdSeq += 1;
    return `auto_${this.autoIdSeq}`;
  }

  seedDoc(path: string, data: DocData): void {
    this.store.set(path, data);
  }

  doc(path: string) {
    return this.makeRef(path);
  }

  private makeRef(path: string) {
    const self = this;
    // Espelha `DocumentReference.parent.parent`: pula o nome da coleção-pai e
    // aponta pro documento avô (ex.: "a/b/c/d" -> parent.parent = doc "a/b").
    const segments = path.split("/");
    const grandparentPath = segments.length >= 4 ? segments.slice(0, -2).join("/") : null;
    return {
      path,
      id: segments[segments.length - 1] ?? "",
      parent: {
        parent: grandparentPath ? self.makeRef(grandparentPath) : null,
      },
      get: async () => self.snapshotOf(path),
      set: async (data: DocData, opts?: {merge?: boolean}) => {
        self.write(path, data, opts);
      },
      update: async (data: DocData) => {
        if (!self.store.has(path)) throw new Error(`update em doc ausente: ${path}`);
        self.write(path, data, {merge: true});
      },
      delete: async () => {
        self.store.delete(path);
      },
      collection: (subPath: string) => self.collection(`${path}/${subPath}`),
    };
  }

  private snapshotOf(path: string) {
    const data = this.store.get(path);
    return {
      exists: data != null,
      id: path.split("/").pop() ?? "",
      data: () => (data ? {...data} : undefined),
      ref: this.makeRef(path),
    };
  }

  private write(path: string, data: DocData, opts?: {merge?: boolean}): void {
    const prev = this.store.get(path);
    this.store.set(path, opts?.merge && prev ? mergeDeep(prev, data) : data);
  }

  collection(path: string) {
    const self = this;
    interface QuerySpec {
      filters: Array<(doc: DocData) => boolean>;
      orderField?: string;
      startAfterValue?: unknown;
      limitCount?: number;
    }
    const makeQuery = (spec: QuerySpec) => ({
      where: (field: string, op: string, value: unknown) =>
        makeQuery({
          ...spec,
          filters: [
            ...spec.filters,
            (doc: DocData) =>
              op === "array-contains"
                ? Array.isArray(doc[field]) &&
                  (doc[field] as unknown[]).includes(value)
                : doc[field] === value,
          ],
        }),
      orderBy: (field: string) => makeQuery({...spec, orderField: field}),
      startAfter: (value: unknown) => makeQuery({...spec, startAfterValue: value}),
      limit: (count: number) => makeQuery({...spec, limitCount: count}),
      get: async () => {
        let entries = [...self.store.entries()]
          .filter(([docPath]) => {
            const parent = docPath.slice(0, docPath.lastIndexOf("/"));
            return parent === path;
          })
          .filter(([, data]) => spec.filters.every((fn) => fn(data)));
        if (spec.orderField) {
          const field = spec.orderField;
          entries = entries.sort(([, a], [, b]) => {
            const av = orderValue(a[field]);
            const bv = orderValue(b[field]);
            return av < bv ? -1 : av > bv ? 1 : 0;
          });
          if (spec.startAfterValue != null) {
            const cutoff = orderValue(spec.startAfterValue);
            entries = entries.filter(([, data]) => orderValue(data[field]) > cutoff);
          }
        }
        if (spec.limitCount != null) entries = entries.slice(0, spec.limitCount);
        return {docs: entries.map(([docPath]) => self.snapshotOf(docPath))};
      },
    });
    return {
      doc: (id?: string) => self.makeRef(`${path}/${id ?? self.nextAutoId()}`),
      add: async (data: DocData) => {
        const id = self.nextAutoId();
        self.write(`${path}/${id}`, data);
        return self.makeRef(`${path}/${id}`);
      },
      ...makeQuery({filters: []}),
    };
  }

  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const self = this;
    const tx = {
      get: async (ref: {path: string}) => self.snapshotOf(ref.path),
      set: (ref: {path: string}, data: DocData, opts?: {merge?: boolean}) => {
        self.write(ref.path, data, opts);
      },
    };
    return fn(tx);
  }
}
