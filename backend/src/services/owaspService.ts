import pool from '../db/connection';
import chroma from '../db/chroma';
import embeddingService from './embeddingService';

class OwaspService {
  async ensureOwaspCorpusIndexed(): Promise<void> {
    try {
      console.log('🔄 Checking if OWASP Security Corpus is indexed in ChromaDB...');
      const collectionName = 'owasp_security';
      const collection = await chroma.getOrCreateCollection(collectionName);
      
      const count = await collection.count();
      if (count > 0) {
        console.log(`✅ OWASP Security Corpus already indexed (count: ${count})`);
        return;
      }

      console.log('🔄 Loading OWASP rules from MySQL database to seed ChromaDB...');
      const [rules] = await pool.query('SELECT * FROM owasp_rules') as any[];
      if (!rules || rules.length === 0) {
        console.warn('⚠️ No OWASP rules found in MySQL to index. Make sure database migrations completed.');
        return;
      }

      console.log(`🔄 Indexing ${rules.length} OWASP rules in ChromaDB...`);
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
          severity: rule.severity
        });
      }

      // Embed rules
      const embeddings = await embeddingService.embed(documents);
      
      await collection.upsert({
        ids,
        embeddings,
        metadatas,
        documents
      });

      console.log(`✅ Successfully indexed ${rules.length} OWASP rules in ChromaDB.`);
    } catch (e) {
      console.error('❌ Error indexing OWASP security corpus:', e);
    }
  }
}

export const owaspService = new OwaspService();
export default owaspService;
