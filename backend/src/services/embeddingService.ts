class EmbeddingService {
  private pipeline: any = null;
  private modelName: string;
  private dimensions: number = 384;

  private static models: Record<string, string> = {
    'minilm': 'Xenova/all-MiniLM-L6-v2',          // 22MB, 384-dim, fast CPU
    'unixcoder': 'Xenova/unixcoder-base',         // 125MB, better code understanding
    'codebert': 'Xenova/codebert-base',           // 125MB, code-specific
  };

  constructor() {
    const modelEnv = (process.env.EMBEDDING_MODEL || 'minilm').toLowerCase();
    this.modelName = EmbeddingService.models[modelEnv] || EmbeddingService.models['minilm'];
    if (modelEnv === 'unixcoder' || modelEnv === 'codebert') {
      this.dimensions = 768; // UnixCoder and CodeBERT produce 768 dimensions
    } else {
      this.dimensions = 384;
    }
  }

  async initialize(): Promise<void> {
    if (this.pipeline) return;

    try {
      console.log(`🔄 Loading embedding model: ${this.modelName}...`);
      // Dynamically import @xenova/transformers
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      console.log(`✅ Embedding model loaded: ${this.modelName} (${this.dimensions} dimensions)`);
    } catch (error) {
      console.error('❌ Failed to initialize embedding pipeline:', error);
      throw error;
    }
  }

  // Helper function to calculate L2 normalization
  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return vector;
    return vector.map(val => val / norm);
  }

  async embed(texts: string[]): Promise<number[][]> {
    await this.initialize();
    const embeddings: number[][] = [];

    for (const text of texts) {
      try {
        // Clean text slightly
        const cleanedText = text.replace(/\r?\n/g, ' ').trim();
        const output = await this.pipeline(cleanedText, { pooling: 'mean', normalize: true });
        const vector = Array.from(output.data) as number[];
        embeddings.push(this.normalize(vector));
      } catch (error) {
        console.error(`Error embedding text snippet: "${text.slice(0, 30)}..."`, error);
        // Fallback to zero vector if embedding fails
        embeddings.push(new Array(this.dimensions).fill(0));
      }
    }

    return embeddings;
  }

  async embedSingle(text: string): Promise<number[]> {
    const res = await this.embed([text]);
    return res[0];
  }

  getModelInfo() {
    return {
      name: this.modelName,
      dimensions: this.dimensions,
      device: 'CPU (local)'
    };
  }
}

export const embeddingService = new EmbeddingService();
export default embeddingService;
