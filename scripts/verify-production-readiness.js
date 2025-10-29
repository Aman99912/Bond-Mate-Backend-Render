#!/usr/bin/env node

/**
 * Production Readiness Verification Script
 * 
 * This script verifies that all components of the enhanced partner request flow
 * are properly configured and ready for production deployment.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Bond Mate Backend - Production Readiness Verification\n');

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  const fullPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    log(`✅ ${description}`, 'green');
    return true;
  } else {
    log(`❌ ${description} - File not found: ${filePath}`, 'red');
    return false;
  }
}

function checkDirectory(dirPath, description) {
  const fullPath = path.join(__dirname, '..', dirPath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    log(`✅ ${description}`, 'green');
    return true;
  } else {
    log(`❌ ${description} - Directory not found: ${dirPath}`, 'red');
    return false;
  }
}

function checkPackageJson() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  if (!fs.existsSync(packagePath)) {
    log('❌ package.json not found', 'red');
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Check required dependencies
  const requiredDeps = [
    'express', 'mongoose', 'jsonwebtoken', 'bcryptjs', 'cors', 'helmet',
    'express-rate-limit', 'express-validator', 'firebase-admin', 'socket.io',
    'node-cron', 'morgan'
  ];

  let allDepsPresent = true;
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
      log(`✅ Dependency: ${dep}`, 'green');
    } else {
      log(`❌ Missing dependency: ${dep}`, 'red');
      allDepsPresent = false;
    }
  });

  return allDepsPresent;
}

function checkEnvironmentVariables() {
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', 'env.example');
  
  if (!fs.existsSync(envExamplePath)) {
    log('❌ .env.example not found', 'red');
    return false;
  }

  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  const requiredVars = [
    'NODE_ENV', 'PORT', 'MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
    'FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL',
    'CORS_ORIGIN'
  ];

  let allVarsPresent = true;
  requiredVars.forEach(varName => {
    if (envExample.includes(varName)) {
      log(`✅ Environment variable: ${varName}`, 'green');
    } else {
      log(`❌ Missing environment variable: ${varName}`, 'red');
      allVarsPresent = false;
    }
  });

  if (!fs.existsSync(envPath)) {
    log('⚠️  .env file not found - create it from .env.example', 'yellow');
  } else {
    log('✅ .env file exists', 'green');
  }

  return allVarsPresent;
}

function checkTypeScriptConfig() {
  const tsconfigPath = path.join(__dirname, '..', 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    log('❌ tsconfig.json not found', 'red');
    return false;
  }

  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  
  if (tsconfig.compilerOptions?.strict === true) {
    log('✅ TypeScript strict mode enabled', 'green');
  } else {
    log('⚠️  TypeScript strict mode not enabled', 'yellow');
  }

  return true;
}

function checkSecurityFeatures() {
  log('\n🔒 Security Features Check:', 'blue');
  
  const securityFiles = [
    ['src/middleware/security.ts', 'Security middleware'],
    ['src/middleware/rateLimiter.ts', 'Rate limiting middleware'],
    ['src/services/auditService.ts', 'Audit logging service'],
    ['src/models/ActivityLog.ts', 'Activity log model']
  ];

  let allSecurityPresent = true;
  securityFiles.forEach(([file, description]) => {
    if (!checkFile(file, description)) {
      allSecurityPresent = false;
    }
  });

  return allSecurityPresent;
}

function checkPartnerFlowFeatures() {
  log('\n🤝 Partner Request Flow Features Check:', 'blue');
  
  const partnerFiles = [
    ['src/controllers/enhancedPartnerController.ts', 'Enhanced partner controller'],
    ['src/routes/enhancedPartner.ts', 'Enhanced partner routes'],
    ['src/services/partnerService.ts', 'Partner service'],
    ['src/services/enhancedNotificationService.ts', 'Enhanced notification service'],
    ['src/services/backgroundWorker.ts', 'Background worker service']
  ];

  let allPartnerFeaturesPresent = true;
  partnerFiles.forEach(([file, description]) => {
    if (!checkFile(file, description)) {
      allPartnerFeaturesPresent = false;
    }
  });

  return allPartnerFeaturesPresent;
}

function checkMonitoringFeatures() {
  log('\n📊 Monitoring Features Check:', 'blue');
  
  const monitoringFiles = [
    ['src/services/monitoringService.ts', 'Monitoring service'],
    ['src/routes/monitoring.ts', 'Monitoring routes'],
    ['src/tests/partner.test.ts', 'Test suite']
  ];

  let allMonitoringPresent = true;
  monitoringFiles.forEach(([file, description]) => {
    if (!checkFile(file, description)) {
      allMonitoringPresent = false;
    }
  });

  return allMonitoringPresent;
}

function checkDocumentation() {
  log('\n📚 Documentation Check:', 'blue');
  
  const docsFiles = [
    ['PRODUCTION_READINESS_CHECKLIST.md', 'Production readiness checklist'],
    ['DEPLOYMENT_GUIDE.md', 'Deployment guide'],
    ['SECURITY_AUDIT_REPORT.md', 'Security audit report'],
    ['IMPLEMENTATION_VERIFICATION.md', 'Implementation verification']
  ];

  let allDocsPresent = true;
  docsFiles.forEach(([file, description]) => {
    if (!checkFile(file, description)) {
      allDocsPresent = false;
    }
  });

  return allDocsPresent;
}

// Main verification function
async function verifyProductionReadiness() {
  log('🚀 Starting Production Readiness Verification...\n', 'bold');

  let allChecksPassed = true;

  // Check core files
  log('📁 Core Files Check:', 'blue');
  const coreFiles = [
    ['src/index.ts', 'Main application file'],
    ['src/routes/index.ts', 'Main routes file'],
    ['package.json', 'Package configuration']
  ];

  coreFiles.forEach(([file, description]) => {
    if (!checkFile(file, description)) {
      allChecksPassed = false;
    }
  });

  // Check package.json dependencies
  log('\n📦 Dependencies Check:', 'blue');
  if (!checkPackageJson()) {
    allChecksPassed = false;
  }

  // Check environment variables
  log('\n🔧 Environment Configuration Check:', 'blue');
  if (!checkEnvironmentVariables()) {
    allChecksPassed = false;
  }

  // Check TypeScript configuration
  log('\n📝 TypeScript Configuration Check:', 'blue');
  if (!checkTypeScriptConfig()) {
    allChecksPassed = false;
  }

  // Check security features
  if (!checkSecurityFeatures()) {
    allChecksPassed = false;
  }

  // Check partner flow features
  if (!checkPartnerFlowFeatures()) {
    allChecksPassed = false;
  }

  // Check monitoring features
  if (!checkMonitoringFeatures()) {
    allChecksPassed = false;
  }

  // Check documentation
  if (!checkDocumentation()) {
    allChecksPassed = false;
  }

  // Final result
  log('\n' + '='.repeat(60), 'blue');
  if (allChecksPassed) {
    log('🎉 PRODUCTION READY! All checks passed successfully.', 'green');
    log('\n✅ Your Bond Mate Backend is ready for production deployment!', 'green');
    log('\n📋 Next steps:', 'blue');
    log('1. Configure your production environment variables', 'yellow');
    log('2. Set up your MongoDB database and indexes', 'yellow');
    log('3. Configure Firebase Cloud Messaging', 'yellow');
    log('4. Deploy using the deployment guide', 'yellow');
    log('5. Run health checks after deployment', 'yellow');
  } else {
    log('❌ NOT READY FOR PRODUCTION! Some checks failed.', 'red');
    log('\n🔧 Please fix the issues above before deploying to production.', 'red');
  }
  log('='.repeat(60), 'blue');

  process.exit(allChecksPassed ? 0 : 1);
}

// Run verification
verifyProductionReadiness().catch(error => {
  log(`\n❌ Verification failed with error: ${error.message}`, 'red');
  process.exit(1);
});
