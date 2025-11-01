#!/usr/bin/env node

/**
 * Basic smoke test to validate package structure
 * Runs before publishing to NPM to catch common issues
 */

const fs = require('fs');
const path = require('path');

const errors = [];

console.log('🔍 Validating package structure...\n');

// Test 1: Verify package.json and extract node definitions
console.log('Checking package.json:');
const packagePath = path.join(__dirname, '../package.json');
let pkg;

if (!fs.existsSync(packagePath)) {
  errors.push('package.json not found');
  console.log('  ✗ package.json - NOT FOUND');
  process.exit(1);
} else {
  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const requiredFields = ['name', 'version', 'description', 'license', 'node-red'];

    requiredFields.forEach(field => {
      if (pkg[field]) {
        console.log(`  ✓ ${field}: ${typeof pkg[field] === 'object' ? JSON.stringify(pkg[field]).substring(0, 50) + '...' : pkg[field]}`);
      } else {
        console.log(`  ✗ ${field} - MISSING`);
        errors.push(`Missing required field in package.json: ${field}`);
      }
    });
  } catch (e) {
    errors.push(`Invalid package.json: ${e.message}`);
    console.log(`  ✗ Invalid JSON: ${e.message}`);
    process.exit(1);
  }
}

// Test 2: Verify all node files defined in package.json exist
console.log('\nChecking node files:');
if (pkg['node-red'] && pkg['node-red'].nodes) {
  const nodeDefinitions = pkg['node-red'].nodes;
  const nodeCount = Object.keys(nodeDefinitions).length;

  if (nodeCount === 0) {
    console.log('  ⚠ No nodes defined in package.json');
  } else {
    Object.entries(nodeDefinitions).forEach(([nodeName, nodePath]) => {
      const fullPath = path.join(__dirname, '..', nodePath);
      if (fs.existsSync(fullPath)) {
        console.log(`  ✓ ${nodePath}`);
      } else {
        console.log(`  ✗ ${nodePath} - NOT FOUND`);
        errors.push(`Missing node file: ${nodePath}`);
      }
    });
  }
} else {
  console.log('  ⚠ No nodes defined in package.json');
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
