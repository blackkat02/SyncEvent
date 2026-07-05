#!/usr/bin/env node
/**
 * Збирає структуру проекту + вміст ключових конфіг-файлів
 * в один project-diagnostic.md для дебагу Docker/Prisma/pnpm workspace.
 *
 * Запуск: node gather-project-info.mjs
 * (з кореня проекту SyncEvent)
 */
import { readdirSync, statSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'coverage', '.turbo', '.pnpm-store']);
const MAX_DEPTH = 6;

function buildTree(dir, prefix = '', depth = 0) {
  if (depth > MAX_DEPTH) return '';
  let out = '';
  let entries;
  try {
    entries = readdirSync(dir).filter(e => !IGNORE_DIRS.has(e)).sort();
  } catch {
    return '';
  }
  entries.forEach((entry, i) => {
    const full = join(dir, entry);
    const isLast = i === entries.length - 1;
    const stat = statSync(full);
    out += `${prefix}${isLast ? '└── ' : '├── '}${entry}${stat.isDirectory() ? '/' : ''}\n`;
    if (stat.isDirectory()) {
      out += buildTree(full, prefix + (isLast ? '    ' : '│   '), depth + 1);
    }
  });
  return out;
}

// Ключові файли, які варто витягнути повністю.
// Додай/прибери шляхи під свою реальну структуру, якщо назви відрізняються.
const FILES_TO_DUMP = [
  'docker-compose.yml',
  'docker-compose.override.yml',
  'pnpm-workspace.yaml',
  'package.json',
  '.env.example',
  'apps/backend/Dockerfile',
  'apps/backend/package.json',
  'apps/backend/prisma/schema.prisma',
  'apps/backend/scripts/check-db.js',
  'apps/frontend/Dockerfile',
  'apps/frontend/package.json',
  'packages/shared/package.json',
  'packages/shared/tsup.config.ts',
  'tsconfig.base.json',
  'Dockerfile.backend-init',
  'docker/backend-init.Dockerfile',
];

function redactSecrets(content) {
  return content
    .replace(/(PASSWORD|SECRET|KEY)=.+/gi, '$1=***REDACTED***');
}

let report = `# SyncEvent — Project Diagnostic\nGenerated: ${new Date().toISOString()}\n\n`;

report += `## Project tree\n\n\`\`\`\n${buildTree(ROOT)}\`\`\`\n\n`;

report += `## Config files\n\n`;
for (const relPath of FILES_TO_DUMP) {
  const full = join(ROOT, relPath);
  if (existsSync(full) && statSync(full).isFile()) {
    let content = readFileSync(full, 'utf-8');
    if (relPath.includes('.env')) content = redactSecrets(content);
    report += `### ${relPath}\n\n\`\`\`\n${content}\n\`\`\`\n\n`;
  } else {
    report += `### ${relPath}\n\n_(not found at this path)_\n\n`;
  }
}

const outPath = join(ROOT, 'project-diagnostic.md');
writeFileSync(outPath, report, 'utf-8');
console.log(`✅ Готово: ${outPath}`);
console.log('Відкрий цей файл і поділись його вмістом.');
