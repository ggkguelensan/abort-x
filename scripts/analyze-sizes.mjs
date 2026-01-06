#!/usr/bin/env node

/**
 * Analyze bundle sizes for each exported function
 *
 * Generates a detailed report of minified and gzipped sizes
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { gzipSync } from 'zlib';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// All exports to analyze
const exports = {
  // Core
  'timeout': 'dist/index.js',
  'any': 'dist/index.js',
  'race': 'dist/index.js',
  'abort': 'dist/index.js',
  'TypedAbortController': 'dist/index.js',
  'linkedController': 'dist/index.js',
  'createTimeoutError': 'dist/index.js',
  'createAbortError': 'dist/index.js',

  // Combinators
  'combine': 'dist/index.js',
  'all': 'dist/index.js',
  'mapReason': 'dist/index.js',
  'filter': 'dist/index.js',
  'filterByType': 'dist/index.js',
  'exclude': 'dist/index.js',
  'tap': 'dist/index.js',
  'tapAsync': 'dist/index.js',
  'debug': 'dist/index.js',
  'onAbort': 'dist/index.js',
  'delay': 'dist/index.js',
  'delayWithCancel': 'dist/index.js',
  'pipe': 'dist/index.js',
  'pipeline': 'dist/index.js',

  // Timing
  'deadline': 'dist/index.js',
  'deadlineAt': 'dist/index.js',
  'withDeadline': 'dist/index.js',
  'idleTimeout': 'dist/index.js',

  // Browser
  'onlineSignal': 'dist/index.js',
  'offlineSignal': 'dist/index.js',
  'visibilitySignal': 'dist/index.js',
  'hiddenSignal': 'dist/index.js',
  'storageQuotaSignal': 'dist/index.js',
  'memoryPressureSignal': 'dist/index.js',

  // Patterns
  'AbortScope': 'dist/index.js',
  'withScope': 'dist/index.js',
  'withRetry': 'dist/index.js',
  'retryable': 'dist/index.js',
  'debounce': 'dist/index.js',
  'throttle': 'dist/index.js',
  'batch': 'dist/index.js',
  'mapAsync': 'dist/index.js',
  'filterAsync': 'dist/index.js',
  'findAsync': 'dist/index.js',

  // Guards
  'isAborted': 'dist/index.js',
  'isTimeout': 'dist/index.js',
  'isAbortRelated': 'dist/index.js',
  'ensure': 'dist/index.js',
  'assertNotAborted': 'dist/index.js',
  'throwIfAborted': 'dist/index.js',
  'abortable': 'dist/index.js',

  // Builder
  'AbortX': 'dist/index.js',
  'AbortXBuilder': 'dist/index.js',
};

// Common use cases to analyze
const useCases = {
  'Basic: timeout + any + isAborted': {
    imports: ['timeout', 'any', 'isAborted'],
  },
  'Fetch with timeout': {
    imports: ['timeout'],
  },
  'Combined signals': {
    imports: ['any', 'timeout'],
  },
  'Retry with backoff': {
    imports: ['withRetry', 'timeout', 'isAborted'],
  },
  'Debounced search': {
    imports: ['debounce'],
  },
  'Scope management': {
    imports: ['AbortScope', 'timeout'],
  },
  'Builder pattern': {
    imports: ['AbortX'],
  },
  'Typed controller': {
    imports: ['TypedAbortController'],
  },
  'Signal combinators': {
    imports: ['pipe', 'mapReason', 'filter', 'tap', 'delay'],
  },
  'Batch processing': {
    imports: ['batch', 'mapAsync'],
  },
  'Browser signals': {
    imports: ['onlineSignal', 'visibilitySignal', 'timeout', 'any'],
  },
};

// React use cases (with react-query example)
const reactUseCases = {
  'React: useAbortController': {
    path: 'dist/react/index.js',
    imports: ['useAbortController'],
  },
  'React: useAbortableAsync': {
    path: 'dist/react/index.js',
    imports: ['useAbortableAsync'],
  },
  'React: All hooks': {
    path: 'dist/react/index.js',
    imports: ['useAbortController', 'useAbortSignal', 'useAbortableAsync'],
  },
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

async function getMinifiedSize(code) {
  // Use esbuild for minification
  const { transform } = await import('esbuild');
  const result = await transform(code, {
    minify: true,
    format: 'esm',
  });
  return result.code.length;
}

function getGzipSize(code) {
  return gzipSync(code).length;
}

async function analyzeImport(name, path, imports, external = []) {
  const importList = Array.isArray(imports) ? imports : [imports];
  const importStatement = `export { ${importList.join(', ')} } from './${path}';`;

  // Create temp file
  const tempFile = join(rootDir, '.size-temp.js');
  writeFileSync(tempFile, importStatement);

  try {
    // Bundle with esbuild
    const externalFlags = external.map(e => `--external:${e}`).join(' ');
    const result = execSync(
      `npx esbuild ${tempFile} --bundle --format=esm --platform=browser --minify ${externalFlags}`,
      { cwd: rootDir, encoding: 'utf-8' }
    );

    const minified = result.length;
    const gzipped = getGzipSize(result);

    return { name, minified, gzipped };
  } catch (error) {
    console.error(`Error analyzing ${name}:`, error.message);
    return { name, minified: 0, gzipped: 0, error: true };
  }
}

async function generateReport() {
  console.log('🔍 Analyzing bundle sizes...\n');

  const results = {
    modules: [],
    functions: [],
    useCases: [],
    reactUseCases: [],
    timestamp: new Date().toISOString(),
  };

  // Analyze modules
  console.log('📦 Modules:');
  const modules = [
    { name: 'abort-x (full)', path: 'dist/index.js' },
    { name: 'abort-x/core', path: 'dist/core/index.js' },
    { name: 'abort-x/combinators', path: 'dist/combinators/index.js' },
    { name: 'abort-x/timing', path: 'dist/timing/index.js' },
    { name: 'abort-x/browser', path: 'dist/browser/index.js' },
    { name: 'abort-x/patterns', path: 'dist/patterns/index.js' },
    { name: 'abort-x/guards', path: 'dist/guards/index.js' },
    { name: 'abort-x/react', path: 'dist/react/index.js' },
  ];

  for (const mod of modules) {
    const fullPath = join(rootDir, mod.path);
    if (!existsSync(fullPath)) continue;

    const code = readFileSync(fullPath, 'utf-8');
    const minified = await getMinifiedSize(code);
    const gzipped = getGzipSize(code);

    results.modules.push({
      name: mod.name,
      minified,
      gzipped,
    });

    console.log(`  ${mod.name.padEnd(25)} ${formatBytes(minified).padStart(10)} → ${formatBytes(gzipped).padStart(10)} gzip`);
  }

  // Analyze individual functions
  console.log('\n📋 Individual functions:');
  for (const [name, path] of Object.entries(exports)) {
    const result = await analyzeImport(name, path, name);
    if (!result.error) {
      results.functions.push(result);
      console.log(`  ${name.padEnd(25)} ${formatBytes(result.minified).padStart(10)} → ${formatBytes(result.gzipped).padStart(10)} gzip`);
    }
  }

  // Analyze use cases
  console.log('\n🎯 Common use cases:');
  for (const [name, config] of Object.entries(useCases)) {
    const result = await analyzeImport(name, 'dist/index.js', config.imports);
    if (!result.error) {
      results.useCases.push({
        ...result,
        imports: config.imports,
      });
      console.log(`  ${name.padEnd(35)} ${formatBytes(result.minified).padStart(10)} → ${formatBytes(result.gzipped).padStart(10)} gzip`);
    }
  }

  // Analyze React use cases
  console.log('\n⚛️  React use cases:');
  for (const [name, config] of Object.entries(reactUseCases)) {
    const result = await analyzeImport(name, config.path, config.imports, ['react']);
    if (!result.error) {
      results.reactUseCases.push({
        ...result,
        imports: config.imports,
      });
      console.log(`  ${name.padEnd(35)} ${formatBytes(result.minified).padStart(10)} → ${formatBytes(result.gzipped).padStart(10)} gzip`);
    }
  }

  // Save JSON report
  const reportPath = join(rootDir, 'size-report.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📊 Report saved to: size-report.json`);

  // Cleanup
  const tempFile = join(rootDir, '.size-temp.js');
  if (existsSync(tempFile)) {
    execSync(`rm ${tempFile}`);
  }

  return results;
}

// Generate markdown table
function generateMarkdown(results) {
  let md = '# Bundle Size Report\n\n';
  md += `Generated: ${results.timestamp}\n\n`;

  md += '## Modules\n\n';
  md += '| Module | Minified | Gzipped |\n';
  md += '|--------|----------|----------|\n';
  for (const mod of results.modules) {
    md += `| ${mod.name} | ${formatBytes(mod.minified)} | ${formatBytes(mod.gzipped)} |\n`;
  }

  md += '\n## Individual Functions\n\n';
  md += '| Function | Minified | Gzipped |\n';
  md += '|----------|----------|----------|\n';
  for (const fn of results.functions.slice(0, 20)) {  // Top 20
    md += `| \`${fn.name}\` | ${formatBytes(fn.minified)} | ${formatBytes(fn.gzipped)} |\n`;
  }

  md += '\n## Common Use Cases\n\n';
  md += '| Use Case | Imports | Minified | Gzipped |\n';
  md += '|----------|---------|----------|----------|\n';
  for (const uc of results.useCases) {
    const imports = uc.imports.map(i => `\`${i}\``).join(', ');
    md += `| ${uc.name} | ${imports} | ${formatBytes(uc.minified)} | ${formatBytes(uc.gzipped)} |\n`;
  }

  return md;
}

// Run analysis
generateReport()
  .then(results => {
    const md = generateMarkdown(results);
    writeFileSync(join(rootDir, 'SIZE_REPORT.md'), md);
    console.log('📝 Markdown report saved to: SIZE_REPORT.md');
  })
  .catch(console.error);
