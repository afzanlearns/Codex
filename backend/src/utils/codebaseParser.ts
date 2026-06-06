import { RepoStructure } from '../services/githubService';

export interface CodebaseMetadata {
  files: Array<{ path: string; score: number; lines: number; size: number }>;
  imports: Record<string, { imports: string[]; imported_by: string[]; fan_in: number; fan_out: number }>;
  functions: Record<string, { signature: string; lines: number; docstring: string }>;
  classes: Record<string, { methods: string[]; parent: string | null; lines: number; docstring: string }>;
  complexity: {
    cyclomatic_complexity: number;
    nesting_depth: number;
  };
  dependencies: {
    external_packages: string[];
    security_risk: string;
  };
}

export function parseCodebaseLocal(structure: RepoStructure): CodebaseMetadata {
  const metadata: CodebaseMetadata = {
    files: [],
    imports: {},
    functions: {},
    classes: {},
    complexity: {
      cyclomatic_complexity: 0,
      nesting_depth: 0,
    },
    dependencies: {
      external_packages: [],
      security_risk: 'low',
    }
  };

  const fileImportsMap: Record<string, string[]> = {};
  const fileImportedByMap: Record<string, string[]> = {};

  for (const f of structure.files) {
    if (f.type === 'file') {
      fileImportsMap[f.path] = [];
      fileImportedByMap[f.path] = [];
    }
  }

  // Helper to resolve relative imports
  const resolveImport = (currentPath: string, importName: string): string | null => {
    if (!importName.startsWith('.')) return null;
    const parts = currentPath.split('/');
    parts.pop(); // remove filename
    const importParts = importName.split('/');
    for (const p of importParts) {
      if (p === '.') continue;
      if (p === '..') {
        parts.pop();
      } else {
        parts.push(p);
      }
    }
    const resolvedBase = parts.join('/');
    // Try to match with known files (with or without extensions)
    for (const f of structure.files) {
      if (f.type === 'file' && (f.path === resolvedBase || f.path.startsWith(resolvedBase + '.'))) {
        return f.path;
      }
    }
    return null;
  };

  let totalNestingDepth = 0;
  let linesCounted = 0;

  // Process sampled files
  for (const f of structure.sampled_files) {
    const ext = f.path.split('.').pop()?.toLowerCase() || '';
    const content = f.content || '';
    const lines = content.split('\n');
    const linesLength = lines.length;
    linesCounted += linesLength;

    let fileMaxNesting = 0;
    let fileComplexity = 0;
    let currentNesting = 0;

    let importRegex: RegExp | null = null;
    let funcRegex: RegExp | null = null;
    let classRegex: RegExp | null = null;

    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
      funcRegex = /(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
      classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
    } else if (ext === 'py') {
      importRegex = /(?:import\s+(\w+)|from\s+([\w.]+)\s+import)/g;
      funcRegex = /def\s+(\w+)\s*\([^)]*\):/g;
      classRegex = /class\s+(\w+)(?:\s*\(([^)]+)\))?:/g;
    } else if (ext === 'go') {
      importRegex = /import\s+(?:\(\s*(?:[\s\S]*?)\)|"([^"]+)")/g;
      funcRegex = /func\s+(?:\([^)]+\)\s*)?(\w+)\s*\([^)]*\)/g;
      classRegex = /type\s+(\w+)\s+struct/g;
    }

    // Parse lines for functions, classes, complexity
    let docstring = '';
    let inDocstring = false;

    for (let i = 0; i < linesLength; i++) {
      const line = lines[i].trim();

      // Complexity / Nesting
      if (line.includes('{') || line.startsWith('def ') || line.startsWith('class ') || line.startsWith('if ') || line.startsWith('for ')) {
        currentNesting++;
        if (currentNesting > fileMaxNesting) fileMaxNesting = currentNesting;
      }
      if (line.includes('}')) {
        currentNesting = Math.max(0, currentNesting - 1);
      }
      if (/\b(if|for|while|catch|case|&&|\|\|)\b/.test(line)) {
        fileComplexity++;
      }

      // Simple docstring/comment extraction
      if (ext === 'py') {
        if (line.includes('"""') || line.includes("'''")) {
          inDocstring = !inDocstring;
          docstring += line.replace(/"""|'''/g, '') + ' ';
        } else if (inDocstring) {
          docstring += line + ' ';
        }
      } else {
        if (line.startsWith('/**') || line.startsWith('/*')) {
          inDocstring = true;
        }
        if (inDocstring) {
          docstring += line.replace(/\/\*\*|\*\/|\*/g, '').trim() + ' ';
        }
        if (line.includes('*/')) {
          inDocstring = false;
        }
      }

      // Truncate docstring if too long
      if (docstring.length > 200) {
        docstring = docstring.slice(0, 200) + '...';
      }
    }

    metadata.complexity.cyclomatic_complexity += fileComplexity;
    totalNestingDepth += fileMaxNesting;

    // Extract functions
    if (funcRegex) {
      funcRegex.lastIndex = 0;
      let match;
      let count = 0;
      while ((match = funcRegex.exec(content)) !== null && count < 8) {
        const name = match[1] || match[2];
        if (name) {
          metadata.functions[`${f.path}::${name}`] = {
            signature: match[0].trim(),
            lines: linesLength,
            docstring: docstring.slice(0, 100).trim(),
          };
          count++;
        }
      }
    }

    // Extract classes
    if (classRegex) {
      classRegex.lastIndex = 0;
      let match;
      let count = 0;
      while ((match = classRegex.exec(content)) !== null && count < 5) {
        const name = match[1];
        const parent = match[2] || null;
        if (name) {
          metadata.classes[`${f.path}::${name}`] = {
            methods: [],
            parent,
            lines: linesLength,
            docstring: docstring.slice(0, 100).trim(),
          };
          count++;
        }
      }
    }

    // Extract imports
    if (importRegex) {
      importRegex.lastIndex = 0;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importName = match[1] || match[2];
        if (importName) {
          const resolved = resolveImport(f.path, importName);
          if (resolved) {
            if (!fileImportsMap[f.path]) fileImportsMap[f.path] = [];
            if (!fileImportsMap[f.path].includes(resolved)) {
              fileImportsMap[f.path].push(resolved);
            }
            if (!fileImportedByMap[resolved]) fileImportedByMap[resolved] = [];
            if (!fileImportedByMap[resolved].includes(f.path)) {
              fileImportedByMap[resolved].push(f.path);
            }
          } else {
            if (!importName.startsWith('.')) {
              const cleanDep = importName.split('/')[0];
              if (!metadata.dependencies.external_packages.includes(cleanDep) && /^[a-zA-Z0-9_-]+$/.test(cleanDep)) {
                metadata.dependencies.external_packages.push(cleanDep);
              }
            }
          }
        }
      }
    }

    // Parse configuration files for dependencies
    const filename = f.path.split('/').pop() || '';
    if (filename === 'package.json') {
      try {
        const parsedJson = JSON.parse(f.content);
        const deps = { ...parsedJson.dependencies, ...parsedJson.devDependencies };
        for (const dep of Object.keys(deps)) {
          if (!metadata.dependencies.external_packages.includes(dep)) {
            metadata.dependencies.external_packages.push(dep);
          }
        }
      } catch {}
    } else if (filename === 'requirements.txt') {
      const depLines = f.content.split('\n');
      for (const dl of depLines) {
        const clean = dl.trim().split('==')[0].split('>=')[0].trim();
        if (clean && !clean.startsWith('#') && !metadata.dependencies.external_packages.includes(clean)) {
          metadata.dependencies.external_packages.push(clean);
        }
      }
    }
  }

  // Assemble files list with importance scores
  for (const f of structure.files) {
    if (f.type !== 'file') continue;
    
    const sampled = structure.sampled_files.find(sf => sf.path === f.path);
    const size = f.size || (sampled ? sampled.content.length : 0);
    const lines = sampled ? sampled.content.split('\n').length : Math.round(size / 40);

    let importance = 0;
    const filename = f.path.split('/').pop() || '';
    if (['main.py', 'index.ts', 'index.js', 'app.py', 'app.ts', 'server.ts', 'main.go', 'main.rs'].includes(filename)) {
      importance += 100;
    }
    const fanIn = fileImportedByMap[f.path]?.length || 0;
    const fanOut = fileImportsMap[f.path]?.length || 0;
    importance += fanIn * 15;
    importance += fanOut * 5;
    if (size > 10000) importance += 20;

    metadata.files.push({
      path: f.path,
      score: importance,
      lines,
      size,
    });

    metadata.imports[f.path] = {
      imports: fileImportsMap[f.path] || [],
      imported_by: fileImportedByMap[f.path] || [],
      fan_in: fanIn,
      fan_out: fanOut,
    };
  }

  metadata.files.sort((a, b) => b.score - a.score);
  metadata.dependencies.external_packages = metadata.dependencies.external_packages.slice(0, 15);
  metadata.complexity.nesting_depth = Math.round(totalNestingDepth / (structure.sampled_files.length || 1));

  return metadata;
}
