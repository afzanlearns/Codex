import pool from '../db/connection';
import chroma from '../db/chroma';
import embeddingService from './embeddingService';

class OwaspService {
  private _count = 0;

  getCount(): number {
    return this._count;
  }

  async loadCorpus(force = false): Promise<void> {
    const collectionName = 'owasp_security';
    const collection = await chroma.getOrCreateCollection(collectionName);

    if (!force) {
      const count = await collection.count();
      if (count > 0) {
        console.log(`✅ OWASP Security Corpus already indexed (count: ${count})`);
        this._count = count;
        return;
      }
    }

    console.log('🔄 Re-seeding OWASP rules in ChromaDB...');
    const [rules] = await pool.query('SELECT * FROM owasp_rules') as any[];
    if (!rules || rules.length === 0) {
      console.warn('⚠️ No OWASP rules found in MySQL to index.');
      return;
    }

    const ids: string[] = [];
    const documents: string[] = [];
    const metadatas: any[] = [];

    for (const rule of rules) {
      const text = `OWASP Category: ${rule.owasp_id} - ${rule.category}. Issue: ${rule.title}. Description: ${rule.description}. Example Code:\n${rule.examples || ''}\nRemediation:\n${rule.remediation || ''}`;
      ids.push(`owasp_${rule.id}`);
      documents.push(text);
      metadatas.push({
        owaspId: rule.owasp_id,
        category: rule.category,
        title: rule.title,
        severity: rule.severity,
      });
    }

    const embeddings = await embeddingService.embed(documents);

    await collection.upsert({ ids, embeddings, metadatas, documents });

    this._count = ids.length;
    console.log(`✅ Successfully indexed ${ids.length} OWASP rules in ChromaDB.`);
  }

  async ensureOwaspCorpusIndexed(): Promise<void> {
    await this.loadCorpus(false);
  }
}

export const owaspService = new OwaspService();
export default owaspService;
