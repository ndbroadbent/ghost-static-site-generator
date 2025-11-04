#!/usr/bin/env node
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs'
  }
});

const generateStaticSite = require('./commands/generateStaticSite.ts');

console.time('Site generated in');

generateStaticSite().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
