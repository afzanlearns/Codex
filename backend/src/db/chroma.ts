import { ChromaClient } from 'chromadb';

class ChromaDB {
  private client: ChromaClient;

  constructor() {
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    this.client = new ChromaClient({
      path: chromaUrl
    });
  }

  getClient(): ChromaClient {
    return this.client;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.heartbeat();
      console.log('✅ Connected to ChromaDB successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to ChromaDB:', (error as Error).message);
      return false;
    }
  }

  async getOrCreateCollection(name: string) {
    return await this.client.getOrCreateCollection({
      name,
      metadata: { "hnsw:space": "cosine" }
    });
  }

  async deleteCollection(name: string) {
    try {
      await this.client.deleteCollection({ name });
      console.log(`🗑️ Deleted ChromaDB collection: ${name}`);
    } catch (e) {
      console.warn(`Warning deleting ChromaDB collection ${name}:`, (e as Error).message);
    }
  }
}

export const chroma = new ChromaDB();
export default chroma;
