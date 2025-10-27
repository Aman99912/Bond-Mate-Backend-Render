# Bond Mate Backend API - Postman Collection

This file contains a complete Postman collection for testing the Bond Mate Backend API.

## 📋 Collection Overview

The collection includes the following main sections:

### 1. **Authentication** (6 requests)
- Register User
- Login
- Force Login (logout other devices)
- Check Active Session
- Logout
- Logout from All Devices

### 2. **User Profile** (6 requests)
- Get Profile
- Update Profile
- Change Password
- Change Sub Password
- Verify Secret Code
- Delete Account

### 3. **OTP Services** (5 requests)
- Send Mobile OTP
- Verify Mobile OTP
- Resend Mobile OTP
- Send Email OTP
- Verify Email OTP

### 4. **Partner Management** (10 requests)
- Search Users
- Send Partner Request
- Get Partner Requests
- Accept/Reject Partner Request
- Cancel Partner Request
- Get Current Partner
- Remove Partner
- Get Partner History
- Get Breakup Request Status

### 5. **System** (1 request)
- Health Check

## 🚀 How to Import

### Method 1: Import via Postman App
1. Open Postman application
2. Click **Import** button (top left)
3. Select **Upload Files**
4. Choose `Bond-Mate-API.postman_collection.json`
5. Click **Import**

### Method 2: Import via Postman Web
1. Go to [Postman Web](https://web.postman.co/)
2. Click **Import** button
3. Select **Upload Files** or drag and drop the JSON file
4. Click **Import**

## ⚙️ Configuration

The collection uses variables for easy configuration:

### Variables
- `baseUrl` - Default: `http://localhost:3000`
- `apiPrefix` - Default: `/api`
- `token` - Automatically saved from login responses

### How Variables Work
1. **baseUrl**: Change this if your server runs on a different port or domain
2. **apiPrefix**: The API path prefix (usually `/api`)
3. **token**: Automatically populated when you login successfully (check the test scripts)

### Updating Base URL for Production
If you want to test against a production server:

1. Open the collection
2. Click on the collection name (Bond Mate Backend API)
3. Click on the **Variables** tab
4. Update the `baseUrl` value to your production URL
5. Save the changes

## 📝 Usage Guide

### Step 1: Start Your Server
Make sure your backend server is running:
```bash
npm run dev
# or
npm start
```

### Step 2: Test Health Check
Start by testing the health endpoint to ensure the server is running:
- Go to **System** folder
- Run **Health Check** request

### Step 3: Register a New User
1. Go to **Authentication** folder
2. Run **Register User** request
3. Update the request body with your test data:
   ```json
   {
     "name": "Test User",
     "email": "test@example.com",
     "password": "password123",
     "mobileNumber": "+1234567890",
     "avatar": "https://example.com/avatar.jpg",
     "bio": "Test bio",
     "dob": "1990-01-01",
     "gender": "male"
   }
   ```

### Step 4: Login
1. Go to **Authentication** folder
2. Run **Login** request
3. The token will be automatically saved to the `token` variable
4. Check the Variables tab to verify the token was saved

### Step 5: Test Protected Endpoints
Once logged in, you can test any protected endpoint:
- Get Profile
- Update Profile
- Partner Management
- etc.

## 🔑 Authentication Flow

The collection includes automatic token management:

1. **Login** responses automatically save the JWT token
2. Protected endpoints use `Bearer {{token}}` header
3. No need to manually copy/paste tokens

### How Token Management Works
```javascript
// Test scripts in login endpoints automatically save tokens:
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    if (jsonData.data && jsonData.data.token) {
        pm.collectionVariables.set('token', jsonData.data.token);
    }
}
```

## 📊 Request Examples

### Example 1: Register User
```http
POST {{baseUrl}}{{apiPrefix}}/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "mobileNumber": "+1234567890",
  "avatar": "https://example.com/avatar.jpg",
  "bio": "Love exploring with my partner 💕",
  "dob": "1990-01-01",
  "gender": "male"
}
```

### Example 2: Login
```http
POST {{baseUrl}}{{apiPrefix}}/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123",
  "deviceId": "device-123",
  "deviceName": "iPhone 13",
  "platform": "ios"
}
```

### Example 3: Get Profile (Protected)
```http
GET {{baseUrl}}{{apiPrefix}}/auth/profile
Authorization: Bearer {{token}}
```

## 🔒 Protected Endpoints

Most endpoints require authentication. The collection automatically includes the `Authorization` header for protected requests.

Protected endpoints include:
- ✅ All User Profile operations
- ✅ Partner Management
- ✅ Email OTP operations
- ✅ All profile updates

## 🧪 Testing Scenarios

### Scenario 1: Complete Registration Flow
1. Register User
2. Check Health
3. Verify server is running

### Scenario 2: Login with Session Management
1. Check Active Session
2. Login
3. Get Profile
4. Logout

### Scenario 3: Partner Connection Flow
1. Login as User A
2. Search Users
3. Send Partner Request to User B
4. Logout User A
5. Login as User B
6. Get Partner Requests
7. Accept Partner Request
8. Get Current Partner

## 🐛 Troubleshooting

### Issue: "Invalid token" errors
**Solution**: Run the Login request again to refresh the token

### Issue: "Cannot connect to server"
**Solution**: 
1. Verify server is running
2. Check the `baseUrl` variable
3. Test with Health Check endpoint

### Issue: "User already exists"
**Solution**: Use a different email or delete the existing user first

### Issue: Variables not updating
**Solution**: 
1. Check test script in login request
2. Verify collection variables are not overwritten
3. Manually set token if needed

## 📚 Additional Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [Production README](./PRODUCTION_README.md)
- [Chat README](./CHAT_README.md)

## 🎯 Quick Test Checklist

- [ ] Import collection into Postman
- [ ] Update baseUrl if needed
- [ ] Start backend server
- [ ] Test Health Check
- [ ] Register a new user
- [ ] Login and verify token is saved
- [ ] Get user profile
- [ ] Test partner search and request
- [ ] Logout

## 💡 Tips

1. **Use Environments**: Create Postman environments for development, staging, and production
2. **Save Responses**: Save example responses for documentation
3. **Run Collections**: Use the Runner to test multiple endpoints at once
4. **Monitor Token Expiry**: JWT tokens expire after 7 days by default
5. **Test Error Cases**: Test 400, 401, 404, 500 error scenarios

## 📞 Support

If you encounter any issues:
1. Check the server logs
2. Verify database connection
3. Review API documentation
4. Test with health check endpoint first

---

**Happy Testing! 🚀**

