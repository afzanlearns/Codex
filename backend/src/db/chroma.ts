import fs from 'fs';
import path from 'path';

// Define the root folder for our serverless local collections
const COLLECTIONS_DIR = path.resolve(__dirname, '../../chroma_data/local_collections');

export interface CollectionItem {
  id: string;
  embedding: number[];
  metadata: any;
  document: string;
}

export class LocalCollection {
  private name: string;
  private filePath: string;

  constructor(name: string, filePath: string) {
    this.name = name;
    this.filePath = filePath;
  }

  private loadItems(): CollectionItem[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error(`Error reading collection file ${this.name}:`, e);
      return [];
    }
  }

  private saveItems(items: CollectionItem[]): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf8');
    } catch (e) {
      console.error(`Error saving collection file ${this.name}:`, e);
    }
  }

  async count(): Promise<number> {
    return this.loadItems().length;
  }

  async get(options: any = {}): Promise<{ ids: string[]; documents: string[]; metadatas: any[]; embeddings?: number[][] }> {
    const items = this.loadItems();
    const filtered = options.ids 
      ? items.filter(item => options.ids.includes(item.id)) 
      : items;
    
    return {
      ids: filtered.map(i => i.id),
      documents: filtered.map(i => i.document),
      metadatas: filtered.map(i => i.metadata),
      embeddings: filtered.map(i => i.embedding)
    };
  }

  async upsert(options: { ids: string[]; embeddings: number[][]; metadatas: any[]; documents: string[] }): Promise<void> {
    const items = this.loadItems();
    const itemMap = new Map<string, CollectionItem>();
    items.forEach(item => itemMap.set(item.id, item));

    for (let i = 0; i < options.ids.length; i++) {
      itemMap.set(options.ids[i], {
        id: options.ids[i],
        embedding: options.embeddings[i],
        metadata: options.metadatas[i],
        document: options.documents[i]
      });
    }

    this.saveItems(Array.from(itemMap.values()));
  }

  async query(options: { queryEmbeddings: number[][]; nResults: number }): Promise<{ ids: string[][]; distances: number[][] }> {
    const items = this.loadItems();
    const queryVector = options.queryEmbeddings[0];
    if (!queryVector || items.length === 0) {
      return { ids: [[]], distances: [[]] };
    }

    // Compute similarity for all items
    // Since embeddings are normalized, similarity is the dot product
    const scoredItems = items.map(item => {
      let similarity = 0;
      const len = Math.min(queryVector.length, item.embedding.length);
      for (let i = 0; i < len; i++) {
        similarity += queryVector[i] * item.embedding[i];
      }
      // Cosine distance = 1.0 - cosine_similarity
      const distance = 1.0 - similarity;
      return { id: item.id, distance };
    });

    // Sort by distance ascending
    scoredItems.sort((a, b) => a.distance - b.distance);

    const topResults = scoredItems.slice(0, options.nResults);
    return {
      ids: [topResults.map(r => r.id)],
      distances: [topResults.map(r => r.distance)]
    };
  }
}

class ChromaDB {
  getClient(): ChromaDB {
    return this;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!fs.existsSync(COLLECTIONS_DIR)) {
        fs.mkdirSync(COLLECTIONS_DIR, { recursive: true });
      }
      console.log('✅ Connected to Local Embedded DB successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Local Embedded DB directory:', (error as Error).message);
      return false;
    }
  }

  async getOrCreateCollection(name: string): Promise<LocalCollection> {
    const colPath = path.join(COLLECTIONS_DIR, `${name}.json`);
    const dir = path.dirname(colPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return new LocalCollection(name, colPath);
  }

  async getCollection(options: { name: string }): Promise<LocalCollection> {
    const colPath = path.join(COLLECTIONS_DIR, `${options.name}.json`);
    if (!fs.existsSync(colPath)) {
      throw new Error(`Collection ${options.name} does not exist`);
    }
    return new LocalCollection(options.name, colPath);
  }

  async deleteCollection(name: string): Promise<void> {
    try {
      const colPath = path.join(COLLECTIONS_DIR, `${name}.json`);
      if (fs.existsSync(colPath)) {
        fs.unlinkSync(colPath);
        console.log(`🗑️ Deleted local collection: ${name}`);
      }
    } catch (e) {
      console.warn(`Warning deleting local collection ${name}:`, (e as Error).message);
    }
  }
}

export const chroma = new ChromaDB();
export default chroma;

