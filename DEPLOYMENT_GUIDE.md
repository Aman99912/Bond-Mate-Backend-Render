# 🚀 Bond Mate Backend - Production Deployment Guide

## 📋 Prerequisites

### System Requirements
- **Node.js**: v18.0.0 or higher
- **MongoDB**: v6.0 or higher
- **Redis**: v6.0 or higher (optional, for caching)
- **Memory**: Minimum 2GB RAM
- **Storage**: Minimum 10GB free space
- **OS**: Linux (Ubuntu 20.04+ recommended) or Windows Server

### Required Services
- **MongoDB Atlas** or self-hosted MongoDB cluster
- **Firebase Project** with Cloud Messaging enabled
- **Domain Name** with SSL certificate
- **Server** (AWS EC2, DigitalOcean, Google Cloud, etc.)

## 🔧 Environment Configuration

### 1. Create Environment File
```bash
# Create production environment file
cp .env.example .env.production
```

### 2. Configure Environment Variables
```env
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/bond_mate_prod
MONGODB_TEST_URI=mongodb+srv://username:password@cluster.mongodb.net/bond_mate_test

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-here
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com,https://your-admin-panel.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Redis Configuration (Optional)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Security
BCRYPT_ROUNDS=12
SESSION_SECRET=your-session-secret-key

# Monitoring (Optional)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
LOG_LEVEL=info
```

## 🏗️ Database Setup

### 1. MongoDB Atlas Setup
```bash
# 1. Create MongoDB Atlas cluster
# 2. Create database user with read/write permissions
# 3. Whitelist your server IP address
# 4. Get connection string
```

### 2. Create Database Indexes
```javascript
// Connect to MongoDB and run these commands
use bond_mate_prod

// User indexes
db.users.createIndex({ "email": 1 }, { unique: true })
db.users.createIndex({ "UserSearchId": 1 }, { unique: true })
db.users.createIndex({ "partners.partnerId": 1 })
db.users.createIndex({ "pendingRequests.requestId": 1 })

// Partner indexes
db.partners.createIndex({ "user1Id": 1, "user2Id": 1 }, { unique: true })
db.partners.createIndex({ "user1Id": 1, "status": 1 })
db.partners.createIndex({ "user2Id": 1, "status": 1 })
db.partners.createIndex({ "status": 1, "startedAt": 1 })

// Partner Request indexes
db.partnerrequests.createIndex({ "fromUserId": 1, "toUserId": 1 })
db.partnerrequests.createIndex({ "status": 1, "createdAt": 1 })
db.partnerrequests.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 604800 })

// Activity Log indexes
db.activitylogs.createIndex({ "userId": 1, "timestamp": -1 })
db.activitylogs.createIndex({ "action": 1, "timestamp": -1 })
db.activitylogs.createIndex({ "timestamp": -1 }, { expireAfterSeconds: 31536000 })

// Nickname indexes
db.nicknames.createIndex({ "ownerId": 1, "targetUserId": 1 }, { unique: true })
```

## 🚀 Deployment Steps

### Option 1: Manual Deployment

#### 1. Prepare Server
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application directory
sudo mkdir -p /var/www/bond-mate-backend
sudo chown $USER:$USER /var/www/bond-mate-backend
cd /var/www/bond-mate-backend
```

#### 2. Deploy Application
```bash
# Clone repository
git clone https://github.com/your-username/bond-mate-backend.git .

# Install dependencies
npm ci --production

# Build application
npm run build

# Copy environment file
cp .env.production .env

# Start application with PM2
pm2 start dist/index.js --name "bond-mate-backend" --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

### Option 2: Docker Deployment

#### 1. Create Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "run", "start:prod"]
```

#### 2. Create docker-compose.yml
```yaml
version: '3.8'

services:
  bond-mate-backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - mongodb
      - redis
    restart: unless-stopped

  mongodb:
    image: mongo:6.0
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=password
    volumes:
      - mongodb_data:/data/db
    restart: unless-stopped

  redis:
    image: redis:6.0-alpine
    ports:
      - "6379:6379"
    command: redis-server --requirepass your-redis-password
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  mongodb_data:
  redis_data:
```

#### 3. Deploy with Docker
```bash
# Build and start services
docker-compose up -d

# Check logs
docker-compose logs -f bond-mate-backend
```

## 🔒 Security Configuration

### 1. Firewall Setup
```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 3000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 2. Nginx Reverse Proxy
```nginx
# /etc/nginx/sites-available/bond-mate-backend
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
```

### 3. SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Monitoring Setup

### 1. PM2 Monitoring
```bash
# Install PM2 monitoring
pm2 install pm2-logrotate
pm2 install pm2-server-monit

# Monitor application
pm2 monit
```

### 2. Health Check Endpoint
```bash
# Test health endpoint
curl https://your-domain.com/api/health

# Expected response:
{
  "success": true,
  "status": "healthy",
  "issues": [],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

### 3. Log Management
```bash
# View application logs
pm2 logs bond-mate-backend

# View error logs
pm2 logs bond-mate-backend --err

# Log rotation (already configured with pm2-logrotate)
```

## 🔄 Backup Strategy

### 1. Database Backup
```bash
# Create backup script
cat > /home/backup/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="mongodb+srv://username:password@cluster.mongodb.net/bond_mate_prod" \
  --out="/home/backup/mongodb_backup_$DATE"
tar -czf "/home/backup/mongodb_backup_$DATE.tar.gz" "/home/backup/mongodb_backup_$DATE"
rm -rf "/home/backup/mongodb_backup_$DATE"
find /home/backup -name "mongodb_backup_*.tar.gz" -mtime +7 -delete
EOF

chmod +x /home/backup/backup.sh

# Schedule daily backups
crontab -e
# Add: 0 2 * * * /home/backup/backup.sh
```

### 2. Application Backup
```bash
# Backup application code
tar -czf bond-mate-backend-backup-$(date +%Y%m%d).tar.gz /var/www/bond-mate-backend
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Application Won't Start
```bash
# Check logs
pm2 logs bond-mate-backend

# Check environment variables
pm2 env 0

# Restart application
pm2 restart bond-mate-backend
```

#### 2. Database Connection Issues
```bash
# Test MongoDB connection
mongo "mongodb+srv://username:password@cluster.mongodb.net/bond_mate_prod"

# Check network connectivity
ping cluster.mongodb.net
```

#### 3. High Memory Usage
```bash
# Check memory usage
pm2 monit

# Restart if needed
pm2 restart bond-mate-backend

# Check for memory leaks
node --inspect dist/index.js
```

#### 4. Rate Limiting Issues
```bash
# Check rate limit logs
grep "rate limit" /var/log/nginx/access.log

# Adjust rate limits in environment variables
```

## 📈 Performance Optimization

### 1. Database Optimization
```javascript
// Monitor slow queries
db.setProfilingLevel(2, { slowms: 100 })

// Check query performance
db.system.profile.find().sort({ ts: -1 }).limit(5)
```

### 2. Application Optimization
```bash
# Enable Node.js optimizations
export NODE_OPTIONS="--max-old-space-size=2048"

# Use cluster mode for multiple processes
pm2 start dist/index.js -i max --name "bond-mate-backend"
```

### 3. Caching Strategy
```bash
# Install Redis for caching
sudo apt install redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
# Set: requirepass your-redis-password
# Set: maxmemory 256mb
# Set: maxmemory-policy allkeys-lru

# Restart Redis
sudo systemctl restart redis-server
```

## ✅ Post-Deployment Verification

### 1. API Endpoints Test
```bash
# Health check
curl https://your-domain.com/api/health

# Partner search (requires JWT)
curl -H "Authorization: Bearer YOUR_JWT" \
  https://your-domain.com/api/enhanced-partners/search?query=test

# Monitoring metrics (admin only)
curl -H "Authorization: Bearer ADMIN_JWT" \
  https://your-domain.com/api/monitoring/metrics
```

### 2. Load Testing
```bash
# Install Apache Bench
sudo apt install apache2-utils

# Test partner request endpoint
ab -n 1000 -c 10 -H "Authorization: Bearer YOUR_JWT" \
  -p request.json -T "application/json" \
  https://your-domain.com/api/enhanced-partners/request
```

### 3. Security Testing
```bash
# Test rate limiting
for i in {1..20}; do
  curl https://your-domain.com/api/enhanced-partners/requests
done

# Test authentication
curl https://your-domain.com/api/enhanced-partners/requests
# Should return 401 Unauthorized
```

## 🎯 Success Metrics

Your deployment is successful when:
- [x] Health endpoint returns "healthy" status
- [x] All API endpoints respond correctly
- [x] Database connections are stable
- [x] Background workers are running
- [x] Monitoring metrics are being collected
- [x] SSL certificate is valid
- [x] Rate limiting is working
- [x] Logs are being generated properly

## 📞 Support

For deployment issues:
1. Check application logs: `pm2 logs bond-mate-backend`
2. Check system logs: `journalctl -u nginx`
3. Verify environment variables: `pm2 env 0`
4. Test database connectivity
5. Check firewall and network configuration

---

**🚀 Your Bond Mate Backend is now production-ready!**
