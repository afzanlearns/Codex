import pool from '../db/connection';
import chroma from '../db/chroma';
import embeddingService from './embeddingService';
import { getRepoStructure } from './githubService';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface RepoFile {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  content?: string;
}

export interface CodeChunk {
  chunkId: string;
  text: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  chunkType: 'function' | 'class' | 'module' | 'block';
}

export interface IndexJob {
  jobId: string;
  repoId: number;
  userId: number;
  status: 'pending' | 'parsing' | 'chunking' | 'embedding' | 'storing' | 'done' | 'failed';
  progress: {
    totalFiles: number;
    filesProcessed: number;
    totalChunks: number;
    chunksEmbedded: number;
    chunksStored: number;
  };
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

class IngestionService {
  private jobs: Map<string, IndexJob> = new Map();

  getJobStatus(jobId: string): IndexJob | null {
    return this.jobs.get(jobId) || null;
  }

  async startIndexing(repoId: number, userId: number, githubToken: string): Promise<string> {
    const jobId = uuidv4();
    const job: IndexJob = {
      jobId,
      repoId,
      userId,
      status: 'pending',
      progress: {
        totalFiles: 0,
        filesProcessed: 0,
        totalChunks: 0,
        chunksEmbedded: 0,
        chunksStored: 0
      },
      startedAt: new Date()
    };
    this.jobs.set(jobId, job);

    // Start async runner
    this.runIndexingJob(job, githubToken).catch(err => {
      console.error(`Error in indexing job ${jobId}:`, err);
      job.status = 'failed';
      job.error = err.message || 'Unknown error';
      this.updateDbStatus(repoId, userId, 'failed', err.message);
    });

    return jobId;
  }

  private async updateDbStatus(repoId: number, userId: number, status: string, error?: string, chunkCount = 0, filesProcessed = 0, totalFiles = 0, durationMs?: number) {
    try {
      const lastIndexed = new Date();
      await pool.query(`
        INSERT INTO indexed_repos (repo_id, user_id, status, chunk_count, files_processed, total_files, error_message, last_indexed_at, index_duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          chunk_count = VALUES(chunk_count),
          files_processed = VALUES(files_processed),
          total_files = VALUES(total_files),
          error_message = VALUES(error_message),
          last_indexed_at = VALUES(last_indexed_at),
          index_duration_ms = VALUES(index_duration_ms)
      `, [repoId, userId, status, chunkCount, filesProcessed, totalFiles, error || null, lastIndexed, durationMs || null]);
    } catch (dbErr) {
      console.error('Failed to update indexed_repos DB status:', dbErr);
    }
  }

  private async runIndexingJob(job: IndexJob, githubToken: string) {
    const startedMs = Date.now();
    job.status = 'parsing';

    // 1. Fetch Repository Details from DB to get Owner and Name
    const [repos] = await pool.query('SELECT owner, name FROM repositories WHERE id = ?', [job.repoId]) as any[];
    if (!repos || repos.length === 0) {
      throw new Error('Repository not found in database.');
    }
    const { owner, name } = repos[0];

    await this.updateDbStatus(job.repoId, job.userId, 'indexing');

    // 2. Fetch Code Files (Utilize existing githubService with custom handling for all files up to 200)
    console.log(`Ingestion: Fetching file structure for ${owner}/${name}...`);
    const structure = await getRepoStructure(githubToken, owner, name);
    
    // Filter to only text files that are source code
    const allFiles = structure.sampled_files.map(sf => ({
      path: sf.path,
      type: 'file' as const,
      size: sf.size,
      content: sf.content
    }));

    job.progress.totalFiles = allFiles.length;
    job.status = 'chunking';

    // 3. Parse and Chunk
    console.log(`Ingestion: Chunking ${allFiles.length} files...`);
    const chunks: CodeChunk[] = [];
    for (const file of allFiles) {
      if (!file.content) continue;
      const fileChunks = this.parseAndChunkFile(file, job.repoId);
      chunks.push(...fileChunks);
      job.progress.filesProcessed++;
    }

    job.progress.totalChunks = chunks.length;
    job.status = 'embedding';

    // 4. Batch Embed & Store in ChromaDB
    const collectionName = `codebase_${job.repoId}`;
    console.log(`Ingestion: Storing ${chunks.length} chunks to ChromaDB collection: ${collectionName}...`);

    // Reset collection
    await chroma.deleteCollection(collectionName);
    const collection = await chroma.getOrCreateCollection(collectionName);

    const batchSize = 32;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const ids = batch.map(c => c.chunkId);
      const texts = batch.map(c => c.text);
      const metadatas = batch.map(c => ({
        filePath: c.filePath,
        startLine: c.startLine,
        endLine: c.endLine,
        language: c.language,
        chunkType: c.chunkType,
        repoId: job.repoId
      }));

      // Embed this batch
      const embeddings = await embeddingService.embed(texts);
      job.progress.chunksEmbedded += batch.length;

      // Store in ChromaDB
      await collection.upsert({
        ids,
        embeddings,
        metadatas,
        documents: texts
      });
      job.progress.chunksStored += batch.length;
    }

    const durationMs = Date.now() - startedMs;
    job.status = 'done';
    job.completedAt = new Date();

    // 5. Update DB Status
    await this.updateDbStatus(
      job.repoId,
      job.userId,
      'ready',
      undefined,
      chunks.length,
      job.progress.filesProcessed,
      job.progress.totalFiles,
      durationMs
    );
    console.log(`✅ Ingestion complete for ${owner}/${name}. Indexed ${chunks.length} chunks.`);
  }

  private parseAndChunkFile(file: RepoFile, repoId: number): CodeChunk[] {
    const ext = file.path.split('.').pop()?.toLowerCase() || '';
    const language = this.mapExtensionToLanguage(ext);
    const content = file.content || '';
    const lines = content.split('\n');

    // Chunker options from env
    const maxTokens = parseInt(process.env.CHUNK_SIZE_TOKENS || '256');
    const overlapTokens = parseInt(process.env.CHUNK_OVERLAP_TOKENS || '32');
    
    // Convert token sizes roughly to lines (1 token ~= 4 chars ~= 0.7 words, let's assume 1 line is ~10 tokens on average)
    const maxLines = Math.max(15, Math.round(maxTokens / 8));
    const overlapLines = Math.max(2, Math.round(overlapTokens / 8));

    const fileChunks: CodeChunk[] = [];

    // Simple Regex Chunker attempting to group classes & functions
    // Find lines matching common structure
    let startIdx = 0;
    let currentBlock: string[] = [];

    // Language specific patterns
    const blockRegexes: Record<string, RegExp> = {
      javascript: /^\s*(class\s+\w+|function\s+\w+|\w+\s*\(.*\)\s*\{|const\s+\w+\s*=\s*\(.*\)\s*=>)/,
      typescript: /^\s*(class\s+\w+|function\s+\w+|\w+\s*\(.*\)\s*\{|const\s+\w+\s*=\s*\(.*\)\s*=>|interface\s+\w+|type\s+\w+)/,
      python: /^\s*(class\s+\w+|def\s+\w+)/,
      go: /^\s*(type\s+\w+\s+struct|func\s+\w+)/,
      java: /^\s*(class\s+\w+|public\s+class\s+\w+|public\s+static\s+\w+|private\s+\w+)/,
      rust: /^\s*(fn\s+\w+|impl\s+\w+|struct\s+\w+|enum\s+\w+|trait\s+\w+)/,
    };

    const pattern = blockRegexes[language];

    if (pattern) {
      // Regex Chunker: Split by blocks
      let chunkLines: string[] = [];
      let currentChunkStartLine = 1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (pattern.test(line) && chunkLines.length >= overlapLines) {
          // If we hit a block definition and already have some lines, cut the chunk
          if (chunkLines.length > 0) {
            const chunkText = chunkLines.join('\n');
            const chunkId = this.generateDeterministicHash(repoId, file.path, currentChunkStartLine);
            fileChunks.push({
              chunkId,
              text: chunkText,
              filePath: file.path,
              startLine: currentChunkStartLine,
              endLine: i,
              language,
              chunkType: this.determineChunkType(chunkText)
            });

            // Keep overlap lines for context continuity
            chunkLines = chunkLines.slice(-overlapLines);
            currentChunkStartLine = i - overlapLines + 1;
          }
        }
        chunkLines.push(line);
      }

      // Add remaining lines
      if (chunkLines.length > 0) {
        const chunkText = chunkLines.join('\n');
        const chunkId = this.generateDeterministicHash(repoId, file.path, currentChunkStartLine);
        fileChunks.push({
          chunkId,
          text: chunkText,
          filePath: file.path,
          startLine: currentChunkStartLine,
          endLine: lines.length,
          language,
          chunkType: this.determineChunkType(chunkText)
        });
      }
    } else {
      // Line sliding window fallback
      for (let i = 0; i < lines.length; i += (maxLines - overlapLines)) {
        const slice = lines.slice(i, i + maxLines);
        if (slice.length === 0) break;

        const chunkText = slice.join('\n');
        const chunkId = this.generateDeterministicHash(repoId, file.path, i + 1);

        fileChunks.push({
          chunkId,
          text: chunkText,
          filePath: file.path,
          startLine: i + 1,
          endLine: Math.min(lines.length, i + maxLines),
          language,
          chunkType: 'block'
        });

        if (i + maxLines >= lines.length) break;
      }
    }

    return fileChunks;
  }

  private mapExtensionToLanguage(ext: string): string {
    const mapping: Record<string, string> = {
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      py: 'python', pyw: 'python',
      go: 'go',
      java: 'java',
      rs: 'rust',
      cpp: 'cpp', cxx: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      sh: 'bash', bash: 'bash',
      sql: 'sql'
    };
    return mapping[ext] || 'text';
  }

  private determineChunkType(text: string): 'function' | 'class' | 'module' | 'block' {
    if (/^\s*(class\s+|interface\s+|struct\s+|impl\s+)/.test(text)) return 'class';
    if (/^\s*(function\s+|def\s+|func\s+|fn\s+)/.test(text)) return 'function';
    return 'block';
  }

  private generateDeterministicHash(repoId: number, filePath: string, startLine: number): string {
    return crypto.createHash('md5')
      .update(`${repoId}:${filePath}:${startLine}`)
      .digest('hex');
  }

  async buildReviewMemoryEntry(reviewComment: any): Promise<void> {
    // Called after reviews to build review_memory corpus
    try {
      const collectionName = 'review_memory';
      const collection = await chroma.getOrCreateCollection(collectionName);
      
      const chunkId = this.generateDeterministicHash(reviewComment.review_id, reviewComment.title || 'finding', reviewComment.line_number || 0);
      const text = `Severity: ${reviewComment.severity || 'medium'}. Category: ${reviewComment.category || 'general'}. Issue: ${reviewComment.title}. Description: ${reviewComment.description}. Fix Suggestion: ${reviewComment.suggestion || 'None'}`;
      
      const metadata = {
        reviewId: reviewComment.review_id,
        severity: reviewComment.severity || 'medium',
        category: reviewComment.category || 'general',
        createdAt: new Date().toISOString()
      };

      const embedding = await embeddingService.embedSingle(text);
      
      await collection.upsert({
        ids: [chunkId],
        embeddings: [embedding],
        metadatas: [metadata],
        documents: [text]
      });
      console.log(`💾 Saved review finding to review_memory: ${reviewComment.title}`);
    } catch (e) {
      console.error('Failed to save review memory entry to ChromaDB:', e);
    }
  }
}

export const ingestionService = new IngestionService();
export default ingestionService;
