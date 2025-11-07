# Admin Setup Guide

## First Admin Creation

Admin users **cannot** be created through the UI. They must be created via:

### Option 1: Using Node Script (Recommended for first admin)

```bash
# Set environment variables (optional, defaults provided)
export ADMIN_EMAIL="admin@bondmate.com"
export ADMIN_PASSWORD="Admin@123456"
export ADMIN_NAME="Super Admin"

# Run the script
node scripts/createAdmin.js
```

### Option 2: Using Postman/API (After first admin is created)

First, login as super_admin to get token:

```http
POST /api/admin/login
Content-Type: application/json

{
  "email": "admin@bondmate.com",
  "password": "Admin@123456"
}
```

Then create new admin:

```http
POST /api/admin/admins
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{
  "name": "New Admin",
  "email": "newadmin@bondmate.com",
  "password": "SecurePassword123",
  "role": "admin",
  "permissions": ["users.read", "users.write"]
}
```

## Admin Roles

- **super_admin**: Full access, can create/manage other admins
- **admin**: Full access to users, partners, analytics
- **moderator**: Limited access to user management
- **support**: Read-only access for support purposes

## Admin Endpoints

All admin endpoints are under `/api/admin/`:

- `POST /api/admin/login` - Admin login
- `POST /api/admin/refresh` - Refresh token
- `POST /api/admin/logout` - Logout
- `GET /api/admin/profile` - Get admin profile
- `PUT /api/admin/change-password` - Change password
- `GET /api/admin/admins` - List all admins (super_admin only)
- `POST /api/admin/admins` - Create admin (super_admin only)
- `PUT /api/admin/admins/:id` - Update admin (super_admin only)
- `DELETE /api/admin/admins/:id` - Delete admin (super_admin only)

## Important Notes

1. **Normal users CANNOT become admins** - Admin is a separate schema
2. **No UI registration for admins** - Must use Postman/API
3. **First admin must be created via script** - No other way
4. **All monitoring routes require admin authentication**

## Environment Variables

Add to `.env`:

```env
ADMIN_EMAIL=admin@bondmate.com
ADMIN_PASSWORD=YourSecurePassword
ADMIN_NAME=Super Admin
```

