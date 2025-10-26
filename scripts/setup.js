#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Bond Mate Backend...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file from template...');
  const envExamplePath = path.join(__dirname, '..', 'env.example');
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .env file created. Please update it with your database credentials.');
  } else {
    console.log('❌ env.example file not found. Please create .env file manually.');
  }
} else {
  console.log('✅ .env file already exists.');
}

// Check if node_modules exists
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.log('📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    console.log('✅ Dependencies installed successfully.');
  } catch (error) {
    console.log('❌ Failed to install dependencies:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Dependencies already installed.');
}

// Generate Prisma client
console.log('🔧 Generating Prisma client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log('✅ Prisma client generated successfully.');
} catch (error) {
  console.log('❌ Failed to generate Prisma client:', error.message);
  process.exit(1);
}

console.log('\n🎉 Setup completed successfully!');
console.log('\nNext steps:');
console.log('1. Update your .env file with the correct DATABASE_URL');
console.log('2. Make sure PostgreSQL is running');
console.log('3. Run: npm run db:migrate (to create database tables)');
console.log('4. Run: npm run dev (to start the development server)');
console.log('\n📚 For more information, check the README.md file.');
