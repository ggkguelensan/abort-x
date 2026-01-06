#!/usr/bin/env node

/**
 * Script to update README.md with current bundle sizes
 * Run after build: npm run build
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { gzipSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function getGzipSize(code) {
  return gzipSync(code).length;
}

async function analyzeImport(path, imports, external = []) {
  let importStatement;
  if (imports === '*') {
    importStatement = `export * from './${path}';`;
  } else {
    const importList = Array.isArray(imports) ? imports : [imports];
    importStatement = `export { ${importList.join(', ')} } from './${path}';`;
  }

  const tempFile = join(rootDir, '.size-temp.js');
  writeFileSync(tempFile, importStatement);

  try {
    const externalFlags = external.map(e => `--external:${e}`).join(' ');
    const result = execSync(
      `npx esbuild ${tempFile} --bundle --format=esm --platform=browser --minify ${externalFlags}`,
      { cwd: rootDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const minified = result.length;
    const gzipped = getGzipSize(result);

    return { minified, gzipped };
  } catch (error) {
    return { minified: 0, gzipped: 0 };
  } finally {
    if (existsSync(tempFile)) {
      execSync(`rm ${tempFile}`, { cwd: rootDir });
    }
  }
}

async function generateSizesTable() {
  console.log('📊 Analyzing bundle sizes for README...');

  // Key modules
  const modules = [
    { name: 'Full bundle', path: 'dist/index.js', imports: '*' },
    { name: 'Core', path: 'dist/core/index.js', imports: '*' },
    { name: 'Combinators', path: 'dist/combinators/index.js', imports: '*' },
    { name: 'Timing', path: 'dist/timing/index.js', imports: '*' },
    { name: 'Browser', path: 'dist/browser/index.js', imports: '*' },
    { name: 'Patterns', path: 'dist/patterns/index.js', imports: '*' },
    { name: 'Guards', path: 'dist/guards/index.js', imports: '*' },
    { name: 'React', path: 'dist/react/index.js', imports: '*', external: ['react'] },
  ];

  // Key functions for common use cases
  const functions = [
    { name: 'timeout', path: 'dist/core/index.js', imports: 'abortSignalTimeout' },
    { name: 'any', path: 'dist/core/index.js', imports: 'abortSignalAny' },
    { name: 'abort', path: 'dist/core/index.js', imports: 'abortSignalAbort' },
    { name: 'isAborted', path: 'dist/guards/index.js', imports: 'isAborted' },
    { name: 'withRetry', path: 'dist/patterns/index.js', imports: 'withRetry' },
    { name: 'debounce', path: 'dist/patterns/index.js', imports: 'debounce' },
    { name: 'AbortScope', path: 'dist/patterns/index.js', imports: 'AbortScope' },
    { name: 'AbortX (builder)', path: 'dist/index.js', imports: 'AbortX' },
  ];

  // Common use cases
  const useCases = [
    {
      name: 'Basic (timeout + any + isAborted)',
      items: [
        { path: 'dist/core/index.js', imports: ['abortSignalTimeout', 'abortSignalAny'] },
        { path: 'dist/guards/index.js', imports: 'isAborted' },
      ]
    },
    {
      name: 'Retry with backoff',
      items: [
        { path: 'dist/patterns/index.js', imports: 'withRetry' },
        { path: 'dist/core/index.js', imports: 'abortSignalTimeout' },
        { path: 'dist/guards/index.js', imports: 'isAborted' },
      ]
    },
  ];

  let modulesTable = '| Module | Minified | Gzipped |\n|--------|----------|----------|\n';

  for (const mod of modules) {
    const external = mod.external || [];
    const size = await analyzeImport(mod.path, mod.imports, external);
    modulesTable += `| ${mod.name} | ${formatBytes(size.minified)} | ${formatBytes(size.gzipped)} |\n`;
    console.log(`  ${mod.name}: ${formatBytes(size.minified)} → ${formatBytes(size.gzipped)} gzip`);
  }

  let functionsTable = '| Function | Minified | Gzipped |\n|----------|----------|----------|\n';

  for (const fn of functions) {
    const size = await analyzeImport(fn.path, fn.imports);
    functionsTable += `| \`${fn.name}\` | ${formatBytes(size.minified)} | ${formatBytes(size.gzipped)} |\n`;
  }

  // Calculate use case sizes (combine multiple imports)
  let useCasesTable = '| Use Case | Minified | Gzipped |\n|----------|----------|----------|\n';

  for (const useCase of useCases) {
    // Create combined import statement
    const imports = useCase.items.map(item => {
      const importList = Array.isArray(item.imports) ? item.imports : [item.imports];
      return `export { ${importList.join(', ')} } from './${item.path}';`;
    }).join('\n');

    const tempFile = join(rootDir, '.size-temp.js');
    writeFileSync(tempFile, imports);

    try {
      const result = execSync(
        `npx esbuild ${tempFile} --bundle --format=esm --platform=browser --minify`,
        { cwd: rootDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      const minified = result.length;
      const gzipped = getGzipSize(result);
      useCasesTable += `| ${useCase.name} | ${formatBytes(minified)} | ${formatBytes(gzipped)} |\n`;
    } catch (error) {
      useCasesTable += `| ${useCase.name} | - | - |\n`;
    } finally {
      if (existsSync(tempFile)) {
        execSync(`rm ${tempFile}`, { cwd: rootDir });
      }
    }
  }

  return { modulesTable, functionsTable, useCasesTable };
}

async function updateReadme() {
  const readmePath = join(rootDir, 'README.md');

  if (!existsSync(readmePath)) {
    console.error('❌ README.md not found');
    process.exit(1);
  }

  const { modulesTable, functionsTable, useCasesTable } = await generateSizesTable();

  let readme = readFileSync(readmePath, 'utf-8');

  // Create the bundle sizes section
  const sizesSection = `## 📦 Bundle Sizes

<!-- BUNDLE_SIZES_START -->
> Auto-generated on build. All sizes are minified.

### Modules

${modulesTable}

### Individual Functions

${functionsTable}

### Common Use Cases

${useCasesTable}
<!-- BUNDLE_SIZES_END -->`;

  // Check if section exists, replace or insert
  const startMarker = '<!-- BUNDLE_SIZES_START -->';
  const endMarker = '<!-- BUNDLE_SIZES_END -->';
  const sectionHeader = '## 📦 Bundle Sizes';

  if (readme.includes(startMarker) && readme.includes(endMarker)) {
    // Replace existing section
    const startIdx = readme.indexOf(sectionHeader);
    const endIdx = readme.indexOf(endMarker) + endMarker.length;

    if (startIdx !== -1) {
      readme = readme.slice(0, startIdx) + sizesSection + readme.slice(endIdx);
    }
  } else if (readme.includes(sectionHeader)) {
    // Find the section and replace until next ## or end
    const startIdx = readme.indexOf(sectionHeader);
    let endIdx = readme.indexOf('\n## ', startIdx + 1);
    if (endIdx === -1) endIdx = readme.length;

    readme = readme.slice(0, startIdx) + sizesSection + '\n\n' + readme.slice(endIdx);
  } else {
    // Insert after installation section or at the beginning of features
    const installIdx = readme.indexOf('## Installation');
    if (installIdx !== -1) {
      let nextSection = readme.indexOf('\n## ', installIdx + 1);
      if (nextSection === -1) nextSection = readme.length;
      readme = readme.slice(0, nextSection) + '\n\n' + sizesSection + readme.slice(nextSection);
    } else {
      // Insert after first heading
      const firstHeadingEnd = readme.indexOf('\n', readme.indexOf('# '));
      readme = readme.slice(0, firstHeadingEnd + 1) + '\n' + sizesSection + '\n' + readme.slice(firstHeadingEnd + 1);
    }
  }

  writeFileSync(readmePath, readme);
  console.log('\n✅ README.md updated with bundle sizes');
}

updateReadme().catch(console.error);
