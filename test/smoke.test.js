#!/usr/bin/env node

/**
 * Basic smoke test to validate package structure
 * Runs before publishing to NPM to catch common issues
 */

const fs = require('fs');
const path = require('path');

const errors = [];

// Test 1: Verify all expected node files exist
const nodesDir = path.join(__dirname, '../nodes');
const expectedNodes = [
  'nodes/generate.js',
  'nodes/embedContent.js',
  'nodes/batchEmbedContent.js',
  'nodes/countTokens.js',
  'nodes/models.js'
];

console.log('🔍 Validating package structure...\n');

console.log('Checking node files:');
expectedNodes.forEach(nodePath => {
  const fullPath = path.join(__dirname, '..', nodePath);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✓ ${nodePath}`);
  } else {
    console.log(`  ✗ ${nodePath} - NOT FOUND`);
    errors.push(`Missing node file: ${nodePath}`);
  }
});

// Test 2: Verify package.json
console.log('\nChecking package.json:');
const packagePath = path.join(__dirname, '../package.json');
if (!fs.existsSync(packagePath)) {
  errors.push('package.json not found');
  console.log('  ✗ package.json - NOT FOUND');
} else {
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const requiredFields = ['name', 'version', 'description', 'license', 'node-red'];

    requiredFields.forEach(field => {
      if (pkg[field]) {
        console.log(`  ✓ ${field}: ${typeof pkg[field] === 'object' ? JSON.stringify(pkg[field]) : pkg[field]}`);
      } else {
        console.log(`  ✗ ${field} - MISSING`);
        errors.push(`Missing required field in package.json: ${field}`);
      }
    });
  } catch (e) {
    errors.push(`Invalid package.json: ${e.message}`);
    console.log(`  ✗ Invalid JSON: ${e.message}`);
  }
}

// Test 3: Verify locales directory
console.log('\nChecking locales:');
const localesDir = path.join(__dirname, '../locales');
if (fs.existsSync(localesDir)) {
  const locales = fs.readdirSync(localesDir);
  if (locales.length > 0) {
    console.log(`  ✓ locales directory exists with ${locales.length} locale(s)`);
  } else {
    console.log('  ⚠ locales directory exists but is empty');
  }
} else {
  console.log('  ✗ locales directory not found');
  errors.push('locales directory not found');
}

// Test 4: Verify README
console.log('\nChecking documentation:');
const readmePath = path.join(__dirname, '../README.md');
if (fs.existsSync(readmePath)) {
  console.log('  ✓ README.md');
} else {
  console.log('  ✗ README.md - NOT FOUND');
  errors.push('README.md not found');
}

// Results
console.log('\n' + '='.repeat(50));
if (errors.length === 0) {
  console.log('✅ All checks passed! Package is ready for publishing.');
  process.exit(0);
} else {
  console.log(`❌ ${errors.length} error(s) found:\n`);
  errors.forEach((error, i) => {
    console.log(`  ${i + 1}. ${error}`);
  });
  process.exit(1);
}
