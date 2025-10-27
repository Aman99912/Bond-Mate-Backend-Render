# Send Partner Request - Postman Example

## Endpoint Details

**URL:** `POST {{baseUrl}}/api/partners/request`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {{token}}
```

## Request Body

```json
{
  "toUserId": "64f8a1b2c3d4e5f6a7b8c9d1"
}
```

## Parameters Explanation

### Required Fields:
- **`toUserId`** (string, required): The MongoDB ObjectId of the user you want to send a partner request to

### Automatic Fields (from JWT token):
- **`fromUserId`**: Automatically extracted from the authenticated user's token

## Complete Postman Example

### Method
```
POST
```

### URL
```
{{baseUrl}}/api/partners/request
```

### Headers Tab
```
Content-Type: application/json
Authorization: Bearer {{token}}
```

### Body Tab (raw JSON)
```json
{
  "toUserId": "64f8a1b2c3d4e5f6a7b8c9d1"
}
```

## Example Scenario

### Step 1: Get User ID to Send Request To
First, you need to know the user ID. You can get it from:
1. Search users endpoint: `GET /api/partners/search?query=john`
2. Register a new test user and note their ID
3. Use a known user ID from database

### Step 2: Send Partner Request
```bash
POST http://localhost:3000/api/partners/request
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "toUserId": "64f8a1b2c3d4e5f6a7b8c9d1"
}
```

## Expected Success Response (201)

```json
{
  "success": true,
  "message": "Partner request sent successfully",
  "data": {
    "request": {
      "id": "67890abcdef1234567890",
      "fromUserId": "12345abcdef6789012345",
      "toUserId": "64f8a1b2c3d4e5f6a7b8c9d1",
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "fromUserId": {
        "name": "John Doe",
        "email": "john@example.com",
        "avatar": "https://example.com/avatar.jpg"
      },
      "toUserId": {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "avatar": "https://example.com/avatar2.jpg"
      }
    }
  }
}
```

## Error Responses

### Error 400: Missing toUserId
```json
{
  "success": false,
  "message": "Partner user ID is required"
}
```

### Error 400: Cannot send to yourself
```json
{
  "success": false,
  "message": "Cannot send request to yourself"
}
```

### Error 400: Already have a partner
```json
{
  "success": false,
  "message": "You already have a partner. Cannot add more than one partner."
}
```

### Error 400: Target user has a partner
```json
{
  "success": false,
  "message": "This user already has a partner"
}
```

### Error 404: User not found
```json
{
  "success": false,
  "message": "User not found"
}
```

## Important Notes

1. **Authentication Required**: You must be logged in and have a valid JWT token
2. **Partner Limit**: Each user can only have one active partner at a time
3. **Self-Request Prevention**: You cannot send a partner request to yourself
4. **Duplicate Prevention**: Old requests between the same users are automatically cleaned up
5. **Real-time Notification**: The target user receives a socket notification immediately
6. **History Tracking**: All partner actions are logged in PartnerHistory

## Testing Flow

### Complete Test Scenario:

1. **Register User A**
   ```json
   POST /api/auth/register
   {
     "name": "John Doe",
     "email": "john@example.com",
     "password": "password123"
   }
   ```
   Save the returned `user.id`

2. **Register User B**
   ```json
   POST /api/auth/register
   {
     "name": "Jane Smith",
     "email": "jane@example.com",
     "password": "password123"
   }
   ```
   Save the returned `user.id`

3. **Login as User A**
   ```json
   POST /api/auth/login
   {
     "email": "john@example.com",
     "password": "password123"
   }
   ```
   Token is auto-saved to `{{token}}` variable

4. **Send Partner Request (User A → User B)**
   ```json
   POST /api/partners/request
   {
     "toUserId": "{{userBId}}"
   }
   ```
   Use User B's ID from step 2

5. **Login as User B and Check Requests**
   ```json
   GET /api/partners/requests
   ```
   Should show the pending request from User A

6. **Accept Request (as User B)**
   ```json
   PUT /api/partners/request/{requestId}/accept
   ```

## Quick Copy-Paste for Postman

### Postman Raw Body
```json
{
  "toUserId": "64f8a1b2c3d4e5f6a7b8c9d1"
}
```

### cURL Command
```bash
curl -X POST http://localhost:3000/api/partners/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "toUserId": "64f8a1b2c3d4e5f6a7b8c9d1"
  }'
```

### JavaScript Fetch
```javascript
const response = await fetch('http://localhost:3000/api/partners/request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    toUserId: '64f8a1b2c3d4e5f6a7b8c9d1'
  })
});

const data = await response.json();
console.log(data);
```

## Variables to Replace

In your Postman request:
1. Replace `{{baseUrl}}` with `http://localhost:3000` (or your server URL)
2. Replace `{{token}}` - this is automatically saved after login
3. Replace `64f8a1b2c3d4e5f6a7b8c9d1` with the actual target user's MongoDB ObjectId

---

**Updated Collection**: The main Postman collection (`Bond-Mate-API.postman_collection.json`) has been updated with the correct body parameters!

