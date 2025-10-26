# Bond Mate Backend - Production Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- MongoDB running on localhost:27017
- Port 3000 available

### Starting the Server

#### Option 1: Using Batch Files (Recommended)
```bash
# For Development
start-dev.bat

# For Production
start-production.bat
```

#### Option 2: Using NPM Commands
```bash
# Development
npm run dev

# Production
npm run build
npm run start:prod
```

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the backend root directory:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI="mongodb://localhost:27017/bond_mate_db"
JWT_SECRET=your-super-secret-jwt-key-here-bond-mate-2024
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://192.168.1.7:3000
```

## 🐛 Troubleshooting

### Port 3000 Already in Use
```bash
# Find the process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace <PID> with actual process ID)
taskkill /PID <PID> /F
```

### Socket Connection Issues
1. Check if backend is running on port 3000
2. Verify MongoDB is running
3. Check network connectivity
4. Review console logs for detailed error messages

### Common Issues Fixed
- ✅ React duplicate key errors in message rendering
- ✅ Socket message duplication
- ✅ Connection status detection
- ✅ Port conflict handling
- ✅ Better error logging

## 📱 Frontend Integration

The frontend should connect to:
- API: `http://192.168.1.7:3000/api`
- Socket: `http://192.168.1.7:3000`

## 🔍 Monitoring

### Health Check
```bash
curl http://192.168.1.7:3000/api/auth/health
```

### Socket Test
The backend includes socket test functionality that logs connection details.

## 📊 Production Features

- ✅ Automatic port conflict detection
- ✅ Better error handling
- ✅ Optimized socket connections
- ✅ Message deduplication
- ✅ Connection status monitoring
- ✅ Production-ready logging

## 🚨 Important Notes

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Change JWT_SECRET** in production
3. **Use HTTPS** in production
4. **Monitor logs** for any issues
5. **Backup MongoDB** regularly

## 📞 Support

If you encounter any issues:
1. Check the console logs
2. Verify all prerequisites are met
3. Ensure no port conflicts
4. Check MongoDB connection
