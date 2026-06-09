import pool from '../db/connection';
import chroma from '../db/chroma';
import embeddingService from './embeddingService';

export interface RetrievedChunk {
  chunkId: string;
  text: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language?: string;
  chunkType?: string;
  corpusName: string;
  semanticScore: number;
  bm25Score: number;
  fusedScore: number;
  displayLabel: string;
}

// Simple in-memory BM25 ranker
class BM25 {
  private documents: string[] = [];
  private docTokens: string[][] = [];
  private avgDocLength: number = 0;
  private idf: Record<string, number> = {};
  private k1: number = 1.5;
  private b: number = 0.75;

  constructor(documents: string[]) {
    this.documents = documents;
    this.docTokens = documents.map(doc => this.tokenize(doc));
    
    const totalLength = this.docTokens.reduce((sum, tokens) => sum + tokens.length, 0);
    this.avgDocLength = documents.length > 0 ? totalLength / documents.length : 0;
    
    this.computeIDF();
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/[^a-zA-Z0-9_]+/);
  }

  private computeIDF() {
    const N = this.documents.length;
    const docCounts: Record<string, number> = {};

    for (const tokens of this.docTokens) {
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        docCounts[token] = (docCounts[token] || 0) + 1;
      }
    }

    for (const [token, count] of Object.entries(docCounts)) {
      this.idf[token] = Math.log(1 + (N - count + 0.5) / (count + 0.5));
    }
  }

  search(query: string): number[] {
    const qTokens = this.tokenize(query);
    const scores = new Array(this.documents.length).fill(0);

    for (let i = 0; i < this.documents.length; i++) {
      const tokens = this.docTokens[i];
      const docLen = tokens.length;
      
      // Calculate term frequencies in this document
      const termFreqs: Record<string, number> = {};
      for (const token of tokens) {
        termFreqs[token] = (termFreqs[token] || 0) + 1;
      }

      let score = 0;
      for (const qToken of qTokens) {
        const tf = termFreqs[qToken] || 0;
        const idfVal = this.idf[qToken] || 0;
        
        if (tf > 0) {
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / (this.avgDocLength || 1)));
          score += idfVal * (numerator / denominator);
        }
      }
      scores[i] = score;
    }

    return scores;
  }
}

class RetrievalService {
  
  async retrieveForReview(
    code: string,
    language: string,
    repoId?: number,
    userId?: number
  ): Promise<RetrievedChunk[]> {
    const startMs = Date.now();
    const corporaQueried: string[] = ['owasp_security'];
    if (repoId) corporaQueried.push(`codebase_${repoId}`);
    
    // Check if review memory exists
    let reviewMemoryCollectionExists = false;
    try {
      const client = chroma.getClient();
      await client.getCollection({ name: 'review_memory' });
      reviewMemoryCollectionExists = true;
      corporaQueried.push('review_memory');
    } catch {}

    const allRetrieved: RetrievedChunk[] = [];

    // Query OWASP Security
    const owaspChunks = await this.retrieveFromCollection(code, 'owasp_security', 5);
    allRetrieved.push(...owaspChunks);

    // Query Codebase
    if (repoId) {
      const codebaseChunks = await this.retrieveFromCollection(code, `codebase_${repoId}`, 5);
      allRetrieved.push(...codebaseChunks);
    }

    // Query Review Memory
    if (reviewMemoryCollectionExists) {
      const memoryChunks = await this.retrieveFromCollection(code, 'review_memory', 3);
      allRetrieved.push(...memoryChunks);
    }

    // Reciprocal Rank Fusion of the merged corpora
    const fused = this.reciprocalRankFusion(
      allRetrieved.filter(c => c.semanticScore > 0), 
      allRetrieved.filter(c => c.bm25Score > 0)
    );

    const topK = parseInt(process.env.TOP_K_RETRIEVAL || '5');
    const finalResults = fused.slice(0, topK);

    const latencyMs = Date.now() - startMs;
    const topScore = finalResults.length > 0 ? finalResults[0].fusedScore : 0;

    // Log to DB
    try {
      await pool.query(`
        INSERT INTO rag_retrieval_logs (session_type, user_id, repo_id, query_text, corpora_queried, chunks_retrieved, retrieval_latency_ms, top_similarity_score)
        VALUES ('review', ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId || null, 
        repoId || null, 
        code.slice(0, 1000), 
        JSON.stringify(corporaQueried), 
        finalResults.length, 
        latencyMs, 
        topScore
      ]);
    } catch (err) {
      console.error('Failed to log RAG retrieval metrics:', err);
    }

    return finalResults;
  }

  async retrieveForChat(
    question: string,
    repoId: number | undefined,
    userId?: number,
    topKOverride?: number,
    collectionNameOverride?: string
  ): Promise<RetrievedChunk[]> {
    const startMs = Date.now();
    const topK = topKOverride ?? parseInt(process.env.TOP_K_RETRIEVAL || '5');

    const allResults: RetrievedChunk[] = [];
    const corporaQueried: string[] = [];

    // Query indexed codebase
    if (repoId) {
      const collectionName = collectionNameOverride || `codebase_${repoId}`;
      corporaQueried.push(collectionName);
      const results = await this.retrieveFromCollection(question, collectionName, topK * 2);
      allResults.push(...results);
    }

    // Also query review memory for any relevant past findings
    try {
      const client = chroma.getClient();
      await client.getCollection({ name: 'review_memory' });
      corporaQueried.push('review_memory');
      const memChunks = await this.retrieveFromCollection(question, 'review_memory', 3);
      allResults.push(...memChunks);
    } catch {}

    const fused = this.reciprocalRankFusion(
      allResults.filter(c => c.semanticScore > 0),
      allResults.filter(c => c.bm25Score > 0)
    );

    const finalResults = fused.slice(0, topK);

    const latencyMs = Date.now() - startMs;
    const topScore = finalResults.length > 0 ? finalResults[0].fusedScore : 0;

    // Log to DB
    try {
      await pool.query(`
        INSERT INTO rag_retrieval_logs (session_type, user_id, repo_id, query_text, corpora_queried, chunks_retrieved, retrieval_latency_ms, top_similarity_score)
        VALUES ('chat', ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId || null,
        repoId || null,
        question.slice(0, 1000),
        JSON.stringify(corporaQueried),
        finalResults.length,
        latencyMs,
        topScore
      ]);
    } catch (err) {
      console.error('Failed to log RAG retrieval metrics:', err);
    }

    return finalResults;
  }

  async retrieveForRefactor(
    code: string,
    language: string,
    repoId?: number,
    userId?: number,
    topKOverride?: number
  ): Promise<RetrievedChunk[]> {
    const startMs = Date.now();
    const topK = topKOverride ?? parseInt(process.env.TOP_K_RETRIEVAL || '5');
    const allResults: RetrievedChunk[] = [];
    const corporaQueried: string[] = [];

    // Query indexed codebase for similar patterns
    if (repoId) {
      const collectionName = `codebase_${repoId}`;
      corporaQueried.push(collectionName);
      const codebaseChunks = await this.retrieveFromCollection(code, collectionName, topK * 2);
      allResults.push(...codebaseChunks);
    }

    // Query review memory for past patterns on similar issues
    try {
      const client = chroma.getClient();
      await client.getCollection({ name: 'review_memory' });
      corporaQueried.push('review_memory');
      const memChunks = await this.retrieveFromCollection(
        `${language} ${code.slice(0, 300)}`,
        'review_memory',
        3
      );
      allResults.push(...memChunks);
    } catch {}

    const fused = this.reciprocalRankFusion(
      allResults.filter(c => c.semanticScore > 0),
      allResults.filter(c => c.bm25Score > 0)
    );

    const finalResults = fused.slice(0, topK);
    const latencyMs = Date.now() - startMs;
    const topScore = finalResults.length > 0 ? finalResults[0].fusedScore : 0;

    try {
      await pool.query(`
        INSERT INTO rag_retrieval_logs (session_type, user_id, repo_id, query_text, corpora_queried, chunks_retrieved, retrieval_latency_ms, top_similarity_score)
        VALUES ('refactor', ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId || null,
        repoId || null,
        code.slice(0, 500),
        JSON.stringify(corporaQueried),
        finalResults.length,
        latencyMs,
        topScore
      ]);
    } catch (err) {
      console.error('Failed to log RAG refactor metrics:', err);
    }

    return finalResults;
  }

  private async retrieveFromCollection(
    query: string,
    collectionName: string,
    topK: number
  ): Promise<RetrievedChunk[]> {
    const chunks: RetrievedChunk[] = [];
    try {
      const collection = await chroma.getOrCreateCollection(collectionName);
      
      // 1. Get all documents for BM25 ranking (essential for hybrid search)
      const allData = await collection.get({});
      if (!allData || !allData.ids || allData.ids.length === 0) {
        return [];
      }

      const ids = allData.ids;
      const docs = allData.documents as string[];
      const metadatas = allData.metadatas as any[];

      // Run BM25 search locally
      const bm25 = new BM25(docs);
      const bm25Scores = bm25.search(query);

      // Normalize BM25 scores to [0, 1] range
      const maxBm25 = Math.max(...bm25Scores, 0.001);
      const normalizedBm25 = bm25Scores.map(score => Math.max(0, score / maxBm25));

      // 2. Run Semantic Vector Similarity Search via ChromaDB
      const queryEmbedding = await embeddingService.embedSingle(query);
      const semanticResults = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK
      });

      // Map semantic results
      const semanticScoresMap: Record<string, number> = {};
      if (semanticResults && semanticResults.ids && semanticResults.ids[0]) {
        for (let i = 0; i < semanticResults.ids[0].length; i++) {
          const id = semanticResults.ids[0][i];
          // Cosine distance in Chroma: 0 = identical, 2 = opposite.
          // Map to similarity: similarity = 1 - distance/2
          const distance = semanticResults.distances?.[0]?.[i] ?? 1.0;
          semanticScoresMap[id] = Math.max(0, 1 - distance / 2);
        }
      }

      // Merge results
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const docText = docs[i];
        const meta = metadatas[i];

        const bm25Score = normalizedBm25[i];
        const semanticScore = semanticScoresMap[id] || 0;

        if (bm25Score > 0.05 || semanticScore > 0.35) {
          const filePath = meta.filePath || meta.owaspId || 'unknown';
          const startLine = meta.startLine || 0;
          const endLine = meta.endLine || 0;
          
          let displayLabel = `${filePath}`;
          if (startLine > 0) displayLabel += `:${startLine}-${endLine}`;
          if (collectionName === 'owasp_security') displayLabel = `OWASP ${meta.owaspId || 'Security'}`;
          if (collectionName === 'review_memory') displayLabel = `Past review`;

          chunks.push({
            chunkId: id,
            text: docText,
            filePath,
            startLine,
            endLine,
            language: meta.language,
            chunkType: meta.chunkType,
            corpusName: collectionName,
            semanticScore,
            bm25Score,
            fusedScore: 0, // Computed in RRF
            displayLabel
          });
        }
      }

    } catch (e) {
      console.warn(`Failed to retrieve from Chroma collection ${collectionName}:`, (e as Error).message);
    }

    return chunks;
  }

  private reciprocalRankFusion(
    semanticResults: RetrievedChunk[],
    bm25Results: RetrievedChunk[],
    k: number = 60
  ): RetrievedChunk[] {
    const semanticWeight = parseFloat(process.env.SEMANTIC_WEIGHT || '0.6');
    const bm25Weight = parseFloat(process.env.BM25_WEIGHT || '0.4');

    // Sort outputs by their individual score to establish rank
    const sortedSemantic = [...semanticResults].sort((a, b) => b.semanticScore - a.semanticScore);
    const sortedBm25 = [...bm25Results].sort((a, b) => b.bm25Score - a.bm25Score);

    const semanticRanks: Record<string, number> = {};
    sortedSemantic.forEach((chunk, index) => {
      semanticRanks[chunk.chunkId] = index + 1;
    });

    const bm25Ranks: Record<string, number> = {};
    sortedBm25.forEach((chunk, index) => {
      bm25Ranks[chunk.chunkId] = index + 1;
    });

    // Merge and compute RRF
    const mergedMap: Record<string, RetrievedChunk> = {};

    for (const chunk of [...semanticResults, ...bm25Results]) {
      if (!mergedMap[chunk.chunkId]) {
        mergedMap[chunk.chunkId] = { ...chunk };
      }
      
      const sRank = semanticRanks[chunk.chunkId];
      const bRank = bm25Ranks[chunk.chunkId];

      const sScore = sRank ? (semanticWeight / (k + sRank)) : 0;
      const bScore = bRank ? (bm25Weight / (k + bRank)) : 0;

      mergedMap[chunk.chunkId].fusedScore = sScore + bScore;
    }

    return Object.values(mergedMap).sort((a, b) => b.fusedScore - a.fusedScore);
  }
}

export const retrievalService = new RetrievalService();
export default retrievalService;
