# Couples App Profile API Documentation

## Overview
This API provides comprehensive profile management for a couples app with streak tracking, partner management, and Firebase notifications.

## Base URL
```
http://localhost:3000/api
```

## Authentication
All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Get User Profile
**GET** `/profile/:userId`

Returns user profile with partner info, streak data, and notifications.

#### Response Example
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "name": "Amandeep",
      "avatar": "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face",
      "bio": "Love exploring new places together 💕",
      "partnerId": "64f8a1b2c3d4e5f6a7b8c9d1",
      "profileCompletionPercentage": 90
    },
    "partner": {
      "id": "64f8a1b2c3d4e5f6a7b8c9d1",
      "name": "Anjali",
      "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face"
    },
    "streak": {
      "days": 7,
      "activeToday": true
    },
    "lastInteractionDate": "2025-01-25T14:30:00.000Z",
    "notifications": [
      "🔥 Amazing! You've maintained your 7-day streak!",
      "💕 Ready to find your perfect match? Add a partner to start building memories together!"
    ],
    "invitePartnerButton": false
  }
}
```

### 2. Send Partner Invitation
**POST** `/profile/invite-partner`

Sends a partner invitation notification with Firebase push notification and phone vibration.

#### Request Body
```json
{
  "userId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "partnerEmail": "partner@example.com"
}
```

#### Response Example
```json
{
  "success": true,
  "message": "Partner invitation sent successfully",
  "data": {
    "requestId": "req_1737825600000_abc123def",
    "partnerName": "Anjali"
  }
}
```

### 3. Update Last Login
**POST** `/profile/update-login`

Updates user's last login timestamp for streak calculation.

#### Request Body
```json
{
  "userId": "64f8a1b2c3d4e5f6a7b8c9d0"
}
```

#### Response Example
```json
{
  "success": true,
  "message": "Last login updated successfully"
}
```

## Streak Logic

### Rules
1. **Streak Increment**: Streak increases by 1 only if both partners are active on the same day
2. **Streak Reset**: If either partner misses login for 24 hours, streak resets to 0
3. **Daily Update**: Automatic daily streak updates via cron job at 12:00 AM UTC
4. **Real-time Check**: Hourly checks for missed logins

### Calculation
- `activeToday`: Both partners logged in today
- `days`: Current streak count
- `streakUpdatedAt`: Last time streak was updated

## Features

### Profile Completion
- Automatically calculated based on filled fields
- Includes: name, email, avatar, bio, dob, gender, mobileNumber, relationshipStatus
- Range: 0-100%

### Notifications
- **Streak Notifications**: Congratulatory messages for maintained streaks
- **Reminder Notifications**: Warnings about breaking streaks
- **Invitation Notifications**: Partner invitation alerts with vibration
- **Weekly Reminders**: Sunday morning streak encouragement

### Firebase Integration
- **Push Notifications**: High-priority notifications with vibration
- **Fallback Support**: Expo push notifications if Firebase fails
- **Rich Data**: Custom data payload for app handling

### Cron Jobs
1. **Daily Streak Update** (12:00 AM UTC): Updates streaks based on yesterday's activity
2. **Hourly Login Check** (Every hour): Resets streaks for missed logins
3. **Weekly Reminders** (Sunday 9:00 AM UTC): Sends streak encouragement notifications

## Database Schema

### User Model Extensions
```javascript
{
  // Streak tracking
  streakDays: { type: Number, default: 0, min: 0 },
  streakUpdatedAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
  profileCompletionPercentage: { type: Number, default: 0, min: 0, max: 100 },
  lastInteractionDate: { type: Date },
  notifications: [{ type: String, trim: true }]
}
```

## Error Handling

### Common Error Responses
```json
{
  "success": false,
  "message": "User not found"
}
```

### HTTP Status Codes
- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `404`: Not Found
- `500`: Internal Server Error

## Testing

### Sample Test Data
The API includes realistic sample data generation:
- **Avatars**: 6 different Unsplash profile images
- **Bios**: 6 romantic couple-themed bios
- **Names**: 12 common Indian names
- **Streak Data**: Realistic login patterns

### Test Scenarios
1. **User with Partner**: Full profile with streak data
2. **User without Partner**: Profile with invitation button
3. **Streak Maintenance**: Both partners active today
4. **Streak Reset**: One partner missed login
5. **Notification Flow**: Partner invitation with Firebase

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install node-cron firebase-admin
   ```

2. **Firebase Configuration**:
   - Set up Firebase project
   - Download service account key
   - Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable

3. **Environment Variables**:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
   ```

4. **Start Server**:
   ```bash
   npm run dev
   ```

## API Usage Examples

### Frontend Integration
```javascript
// Get user profile
const response = await fetch('/api/profile/64f8a1b2c3d4e5f6a7b8c9d0', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
const profileData = await response.json();

// Send partner invitation
const inviteResponse = await fetch('/api/profile/invite-partner', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: '64f8a1b2c3d4e5f6a7b8c9d0',
    partnerEmail: 'partner@example.com'
  })
});
```

### Notification Handling
```javascript
// Handle Firebase notification
messaging.onMessage((payload) => {
  if (payload.data.type === 'partner_invitation') {
    // Show notification with vibration
    navigator.vibrate([200, 100, 200]);
    showNotification(payload.notification.title, payload.notification.body);
  }
});
```

## Performance Considerations

- **Database Indexing**: Optimized queries with proper indexes
- **Caching**: Notification data cached for quick access
- **Rate Limiting**: Built-in protection against abuse
- **Error Recovery**: Graceful fallbacks for failed operations

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Comprehensive request validation
- **SQL Injection Protection**: Parameterized queries
- **Rate Limiting**: Prevents API abuse
- **CORS Configuration**: Secure cross-origin requests
