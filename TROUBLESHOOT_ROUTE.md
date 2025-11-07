# Troubleshooting: Route /api/admin/login not found

## ✅ Route Configuration (Verified Correct)

1. **App Level** (`src/index.ts:48`):
   ```typescript
   app.use('/api', routes);
   ```

2. **Router Level** (`src/routes/index.ts:57`):
   ```typescript
   router.use('/admin', adminRoutes);
   ```

3. **Admin Route** (`src/routes/admin.ts:20`):
   ```typescript
   router.post('/login', validateLogin, adminLogin);
   ```

**Final Route**: `POST /api/admin/login` ✅

## 🔧 Solutions

### Solution 1: Restart Server
The route was just added. **You MUST restart the server** for changes to take effect:

```bash
# Stop server (Ctrl+C if running)
# Then start again:
npm run dev
# or
npm start
```

### Solution 2: Verify Route Registration
Check if route is registered by adding a test endpoint:

```typescript
// In src/routes/admin.ts, add before other routes:
router.get('/test', (req, res) => {
  res.json({ message: 'Admin routes working!' });
});
```

Then test: `GET http://localhost:3000/api/admin/test`

### Solution 3: Check for Import Errors
Ensure all imports are correct:

1. **Check `src/routes/index.ts`** - Should import adminRoutes:
   ```typescript
   import adminRoutes from './admin';
   ```

2. **Check `src/routes/admin.ts`** - Should export default:
   ```typescript
   export default router;
   ```

3. **Check `src/controllers/adminController.ts`** - Should export adminLogin:
   ```typescript
   export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
     // ...
   });
   ```

### Solution 4: Clear Build Cache
If using TypeScript compilation:

```bash
# Delete dist folder
rm -rf dist
# or on Windows:
Remove-Item -Recurse -Force dist

# Rebuild
npm run build
npm start
```

### Solution 5: Test with Postman/cURL
Use the exact URL:

```bash
POST http://localhost:3000/api/admin/login
Content-Type: application/json

{
  "email": "admin@bondmate.com",
  "password": "Admin@123456"
}
```

## 🐛 Common Issues

1. **Server not restarted** - Most common issue
2. **Wrong port** - Check if server is on different port
3. **Route path typo** - Ensure exact path: `/api/admin/login`
4. **Middleware blocking** - Check security middleware
5. **Import/export mismatch** - Verify all exports

## ✅ Verification Checklist

- [ ] Server restarted after adding route
- [ ] Route path is exactly `/api/admin/login`
- [ ] All imports are correct
- [ ] No TypeScript/compilation errors
- [ ] Server logs show route registration
- [ ] Port matches (default 3000)

## 📝 Expected Response

If route is working, you should get:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "admin": {
      "id": "...",
      "name": "...",
      "email": "...",
      "role": "super_admin"
    },
    "token": "eyJhbGc..."
  }
}
```

If route is NOT found, you'll get 404.

