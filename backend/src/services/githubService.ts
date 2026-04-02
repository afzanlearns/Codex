import { Octokit } from 'octokit';

export interface RepoFile {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface RepoStructure {
  name: string;
  full_name: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  files: RepoFile[];
  sampled_files: { path: string; content: string; size: number }[];
  languages: Record<string, number>;
  file_count: number;
  total_size: number;
  directory_structure: string;
  file_type_breakdown: Record<string, number>;
}

const SOURCE_EXTENSIONS = new Set([
  'ts','tsx','js','jsx','py','java','go','rs','cpp','c','cs',
  'rb','php','swift','kt','scala','vue','svelte','dart','ex','exs',
  'mjs','cjs','cts','mts',
]);

const CONFIG_EXTENSIONS = new Set([
  'json','yaml','yml','toml','env','md','txt','graphql','sql','sh','bash','prisma',
]);

const SKIP_EXTENSIONS = new Set([
  'png','jpg','jpeg','gif','svg','ico','webp','bmp','mp4','mp3','wav','mov',
  'pdf','zip','tar','gz','woff','woff2','ttf','eot','map','lock',
]);

const SKIP_DIRS = new Set([
  'node_modules','.git','dist','build','out','.next','.nuxt','coverage',
  '__pycache__','.pytest_cache','venv','env','.venv','vendor','target',
  'bin','obj','.idea','.vscode','.turbo','.cache','tmp','temp',
  'public/fonts','public/images','assets/fonts',
]);

function getExtension(path: string): string {
  const filename = path.split('/').pop() || '';
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  // Handle double extensions like .d.ts
  if (parts.length >= 3 && parts[parts.length - 2] === 'd') return 'd.ts';
  return parts[parts.length - 1].toLowerCase();
}

function shouldSkipPath(path: string): boolean {
  const segments = path.split('/');
  for (const seg of segments.slice(0, -1)) {
    if (SKIP_DIRS.has(seg)) return true;
    if (seg.startsWith('.') && seg !== '.env.example' && seg !== '.github') return true;
  }
  const ext = getExtension(path);
  if (SKIP_EXTENSIONS.has(ext)) return true;
  if (path.includes('.min.')) return true;
  if (path.includes('.generated.') || path.includes('__generated__')) return true;
  if (path.endsWith('.d.ts')) return true;
  return false;
}

function scoreFile(path: string): number {
  const filename = path.split('/').pop()?.toLowerCase() || '';
  const ext = getExtension(path);
  let score = 0;

  // Highest priority — entry points and key config files
  const CRITICAL = new Set([
    'index.ts','index.js','index.tsx','index.jsx',
    'main.ts','main.js','main.tsx','app.ts','app.js','app.tsx','app.jsx',
    'server.ts','server.js','server.tsx',
    'main.py','app.py','__init__.py','manage.py',
    'main.go','main.rs','lib.rs',
    'readme.md','package.json','cargo.toml','go.mod',
    'requirements.txt','pyproject.toml','setup.py',
    'schema.prisma','schema.graphql','docker-compose.yml','dockerfile',
  ]);
  if (CRITICAL.has(filename)) score += 120;

  // Source files get strong base score
  if (SOURCE_EXTENSIONS.has(ext)) score += 60;
  else if (CONFIG_EXTENSIONS.has(ext)) score += 25;
  else score -= 20;

  // Reward files that look important by name
  if (/(controller|service|model|router|handler|middleware|store|hook|util|helper|auth|api|db|database|schema|types|interface)/i.test(filename)) {
    score += 30;
  }

  // Slight reward for src/ — most important code lives there
  if (path.startsWith('src/') || path.startsWith('app/') || path.startsWith('lib/')) {
    score += 15;
  }

  // Deprioritize tests slightly but still include some
  if (/(test|spec|__tests__|__mocks__|fixture|mock)/i.test(path)) score -= 25;

  // Deprioritize deeply nested paths slightly
  const depth = path.split('/').length;
  if (depth > 5) score -= (depth - 5) * 2;

  return score;
}

function getFileTypeBreakdown(files: RepoFile[]): Record<string, number> {
  const bd: Record<string, number> = {};
  for (const f of files) {
    if (f.type !== 'file') continue;
    const ext = getExtension(f.path) || 'other';
    if (!SKIP_EXTENSIONS.has(ext)) bd[ext] = (bd[ext] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(bd).sort(([,a],[,b]) => b - a).slice(0, 15)
  );
}

function buildDirectoryTree(files: RepoFile[]): string {
  const filesByDir: Record<string, string[]> = {};
  for (const f of files) {
    if (shouldSkipPath(f.path) || f.type !== 'file') continue;
    const parts = f.path.split('/');
    const dir   = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    if (!filesByDir[dir]) filesByDir[dir] = [];
    filesByDir[dir].push(parts[parts.length - 1]);
  }
  const lines: string[] = [];
  for (const dir of Object.keys(filesByDir).sort().slice(0, 80)) {
    const indent     = dir === '.' ? '' : '  '.repeat(Math.min(dir.split('/').length - 1, 4));
    const dirLabel   = dir === '.' ? '.' : dir.split('/').pop()!;
    if (dir !== '.') lines.push(`${indent}${dirLabel}/`);
    const fileIndent = dir === '.' ? '  ' : indent + '  ';
    for (const name of filesByDir[dir].slice(0, 10)) {
      lines.push(`${fileIndent}${name}`);
    }
    const overflow = filesByDir[dir].length - 10;
    if (overflow > 0) lines.push(`${fileIndent}… ${overflow} more`);
  }
  return lines.join('\n');
}

// Recursively walk directories to overcome GitHub tree truncation
async function walkDirectory(
  octokit: Octokit,
  owner: string,
  repo: string,
  dirPath: string,
  branch: string,
  collected: RepoFile[],
  depth: number
): Promise<void> {
  if (depth > 6) return; // don't go infinitely deep
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path: dirPath, ref: branch });
    if (!Array.isArray(data)) return;
    for (const item of data) {
      if (item.type === 'file') {
        collected.push({ path: item.path, type: 'file', size: item.size });
      } else if (item.type === 'dir') {
        // Skip blacklisted dirs immediately
        const seg = item.name;
        if (!SKIP_DIRS.has(seg) && !seg.startsWith('.')) {
          collected.push({ path: item.path, type: 'dir' });
          // Recurse into this directory
          await walkDirectory(octokit, owner, repo, item.path, branch, collected, depth + 1);
        }
      }
    }
  } catch { /* skip inaccessible paths */ }
}

export async function getUserRepos(accessToken: string): Promise<unknown[]> {
  const octokit = new Octokit({ auth: accessToken });
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated', per_page: 50, type: 'all',
  });
  return data.map((r: any) => ({
    id:             r.id,
    name:           r.name,
    full_name:      r.full_name,
    description:    r.description,
    language:       r.language,
    stars:          r.stargazers_count,
    forks:          r.forks_count,
    updated_at:     r.updated_at,
    private:        r.private,
    url:            r.html_url,
    default_branch: r.default_branch,
  }));
}

export async function getRepoStructure(
  accessToken: string,
  owner: string,
  repo: string
): Promise<RepoStructure> {
  const octokit = accessToken ? new Octokit({ auth: accessToken }) : new Octokit();

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const branch = repoData.default_branch;

  // Strategy: try recursive tree first, fall back to directory walking
  let allFiles: RepoFile[] = [];
  let usedWalk = false;

  try {
    const { data: treeData } = await octokit.rest.git.getTree({
      owner, repo, tree_sha: branch, recursive: '1',
    });

    if (treeData.truncated) {
      // Tree was truncated — use directory walking instead
      usedWalk = true;
    } else {
      allFiles = (treeData.tree || [])
        .filter((f: any) => f.path && f.type)
        .map((f: any) => ({ 
          path: f.path!, 
          type: f.type === 'blob' ? 'file' : 'dir', 
          size: f.size 
        }));
    }
  } catch {
    usedWalk = true;
  }

  if (usedWalk) {
    // Walk directory by directory — slower but complete
    await walkDirectory(octokit, owner, repo, '', branch, allFiles, 0);
  }

  // Filter to readable files only
  const readableFiles = allFiles.filter(f => f.type === 'file' && !shouldSkipPath(f.path));
  const fileCount     = readableFiles.length;

  // Score, rank, and pick top 18 (Stay under Groq's 12k TPM limit)
  const ranked = readableFiles
    .map(f => ({ ...f, score: scoreFile(f.path) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);

  // Fetch language stats
  const { data: langs } = await octokit.rest.repos.listLanguages({ owner, repo });

  // Fetch file contents in parallel, max 4500 chars each
  const sampled_files: { path: string; content: string; size: number }[] = [];
  await Promise.allSettled(
    ranked.map(async f => {
      try {
        const { data: fd } = await octokit.rest.repos.getContent({ owner, repo, path: f.path, ref: branch });
        if ('content' in fd && typeof fd.content === 'string') {
          const decoded = Buffer.from(fd.content, 'base64').toString('utf-8');
          if (!decoded.includes('\x00')) { // skip binaries
            sampled_files.push({ path: f.path, content: decoded.slice(0, 2000), size: (fd as any).size || 0 });
          }
        }
      } catch { /* skip */ }
    })
  );

  // Restore priority order
  sampled_files.sort((a, b) =>
    ranked.findIndex(r => r.path === a.path) - ranked.findIndex(r => r.path === b.path)
  );

  return {
    name:                repoData.name,
    full_name:           repoData.full_name,
    description:         repoData.description ?? undefined,
    language:            repoData.language ?? undefined,
    stars:               repoData.stargazers_count,
    forks:               repoData.forks_count,
    files:               allFiles,
    sampled_files,
    languages:           langs as Record<string, number>,
    file_count:          fileCount,
    total_size:          repoData.size,
    directory_structure: buildDirectoryTree(allFiles),
    file_type_breakdown: getFileTypeBreakdown(allFiles),
  };
}

export async function postPRComment(
  accessToken: string,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
): Promise<void> {
  const octokit = new Octokit({ auth: accessToken });
  await octokit.rest.issues.createComment({
    owner, repo, issue_number: pullNumber, body,
  });
}
