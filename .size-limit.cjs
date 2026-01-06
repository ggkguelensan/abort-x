/**
 * Size limit configuration
 *
 * Run `npm run size` to check bundle sizes
 * Run `npm run size:report` to generate detailed report
 */

module.exports = [
  // ============================================
  // Full bundle
  // ============================================
  {
    name: 'Full bundle (all features)',
    path: 'dist/index.js',
    import: '*',
    limit: '12 KB',
  },

  // ============================================
  // Individual modules
  // ============================================
  {
    name: 'abort-x/core',
    path: 'dist/core/index.js',
    import: '*',
    limit: '2 KB',
  },
  {
    name: 'abort-x/combinators',
    path: 'dist/combinators/index.js',
    import: '*',
    limit: '3 KB',
  },
  {
    name: 'abort-x/timing',
    path: 'dist/timing/index.js',
    import: '*',
    limit: '2 KB',
  },
  {
    name: 'abort-x/browser',
    path: 'dist/browser/index.js',
    import: '*',
    limit: '2 KB',
  },
  {
    name: 'abort-x/patterns',
    path: 'dist/patterns/index.js',
    import: '*',
    limit: '5 KB',
  },
  {
    name: 'abort-x/guards',
    path: 'dist/guards/index.js',
    import: '*',
    limit: '1.5 KB',
  },
  {
    name: 'abort-x/react',
    path: 'dist/react/index.js',
    import: '*',
    limit: '2 KB',
  },

  // ============================================
  // Core functions (individual)
  // ============================================
  {
    name: 'timeout (single function)',
    path: 'dist/index.js',
    import: '{ timeout }',
    limit: '500 B',
  },
  {
    name: 'any/race (single function)',
    path: 'dist/index.js',
    import: '{ any }',
    limit: '600 B',
  },
  {
    name: 'abort (single function)',
    path: 'dist/index.js',
    import: '{ abort }',
    limit: '400 B',
  },

  // ============================================
  // Common use cases
  // ============================================
  {
    name: 'Basic usage (timeout + any + isAborted)',
    path: 'dist/index.js',
    import: '{ timeout, any, isAborted }',
    limit: '1 KB',
  },
  {
    name: 'Retry pattern',
    path: 'dist/index.js',
    import: '{ withRetry, timeout, isAborted }',
    limit: '3 KB',
  },
  {
    name: 'Debounce pattern',
    path: 'dist/index.js',
    import: '{ debounce }',
    limit: '2 KB',
  },
  {
    name: 'Scope management',
    path: 'dist/index.js',
    import: '{ AbortScope }',
    limit: '2 KB',
  },
  {
    name: 'Builder API',
    path: 'dist/index.js',
    import: '{ AbortX }',
    limit: '2 KB',
  },
  {
    name: 'TypedAbortController',
    path: 'dist/index.js',
    import: '{ TypedAbortController }',
    limit: '1 KB',
  },

  // ============================================
  // Combinators
  // ============================================
  {
    name: 'pipe + mapReason + filter',
    path: 'dist/index.js',
    import: '{ pipe, mapReason, filter }',
    limit: '1.5 KB',
  },
  {
    name: 'tap + delay',
    path: 'dist/index.js',
    import: '{ tap, delay }',
    limit: '1 KB',
  },

  // ============================================
  // React integration
  // ============================================
  {
    name: 'React: useAbortController',
    path: 'dist/react/index.js',
    import: '{ useAbortController }',
    limit: '500 B',
  },
  {
    name: 'React: useAbortableAsync',
    path: 'dist/react/index.js',
    import: '{ useAbortableAsync }',
    limit: '1.5 KB',
  },
];
