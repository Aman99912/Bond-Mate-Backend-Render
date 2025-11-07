# Route Debugging Guide

## Route Path Structure

The admin routes are configured as follows:

1. **Main App** (`src/index.ts`):
   - Routes mounted at: `/api`
   - Code: `app.use('/api', routes)`

2. **Main Router** (`src/routes/index.ts`):
   - Admin routes mounted at: `/admin`
   - Code: `router.use('/admin', adminRoutes)`

3. **Admin Router** (`src/routes/admin.ts`):
   - Login route: `/login`
   - Code: `router.post('/login', ...validateLogin, adminLogin)`

## Final Route Path

**Expected path**: `/api/admin/login`

## Troubleshooting

If route is not found:

1. **Check server restart**:
   ```bash
   # Stop the server (Ctrl+C)
   # Then restart:
   npm run dev
   # or
   npm start
   ```

2. **Check route registration**:
   - Open browser/Postman
   - Try: `POST http://localhost:3000/api/admin/login`
   - Check server logs for route registration

3. **Verify imports**:
   - Ensure `adminRoutes` is imported in `src/routes/index.ts`
   - Ensure `adminController` functions are exported
   - Ensure middleware is properly imported

4. **Check for errors**:
   - Look for compilation errors
   - Check console for import errors
   - Verify all dependencies are installed

## Test the Route

Use Postman or curl:

```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@bondmate.com",
    "password": "Admin@123456"
  }'
```

