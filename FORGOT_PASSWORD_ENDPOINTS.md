# Forgot Password - Complete Endpoint Mapping

## Backend Endpoints

### 1. Reset Password (Main Password)
**Route:** `POST /api/auth/reset-password`  
**Controller:** `resetPasswordWithOTP` in `authController.ts`  
**Middleware:** None (public route)

**Request Body:**
```json
{
  "mobileNumber": "9876543210",
  "otp": "1234",
  "newPassword": "newSecurePassword123"
}
```

**Controller Logic:**
1. Validates input (mobileNumber, otp, newPassword)
2. Validates password length (min 6 characters)
3. Finds user by mobileNumber
4. Verifies OTP with purpose='password_reset'
5. Marks OTP as used
6. Hashes new password
7. Updates user password
8. Returns success response

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

### 2. Reset Sub Password
**Route:** `POST /api/auth/reset-sub-password`  
**Controller:** `resetSubPasswordWithOTP` in `authController.ts`  
**Middleware:** None (public route)

**Request Body:**
```json
{
  "mobileNumber": "9876543210",
  "otp": "1234",
  "newSubPassword": "1234"
}
```

**Controller Logic:**
1. Validates input (mobileNumber, otp, newSubPassword)
2. Validates sub-password length (min 4 characters)
3. Finds user by mobileNumber
4. Verifies OTP with purpose='password_reset'
5. Marks OTP as used
6. Hashes new sub-password
7. Updates user subPassword
8. Returns success response

**Response:**
```json
{
  "success": true,
  "message": "Sub-password reset successfully"
}
```

---

## Frontend API Calls

### 1. Reset Password API
**Location:** `Bond-Mate/api/authApi.ts`  
**Function:** `resetPassword()`

```typescript
resetPassword: async (data: { mobileNumber: string; otp: string; newPassword: string }) => {
  try {
    const response = await sharedApi.post('/auth/reset-password', data);
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error.message;
  }
}
```

**Used in:** `ForgotYourPassword.tsx`

---

### 2. Reset Sub Password API
**Location:** `Bond-Mate/api/authApi.ts`  
**Function:** `resetSubPassword()`

```typescript
resetSubPassword: async (data: { mobileNumber: string; otp: string; newSubPassword: string }) => {
  try {
    const response = await sharedApi.post('/auth/reset-sub-password', data);
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error.message;
  }
}
```

**Used in:** `ForgotSubPassword.tsx`

---

## Frontend Component Flow

### ForgotYourPassword.tsx
**Flow:**
1. Step 1: Enter mobile number → Send OTP
2. Step 2: Enter OTP → Verify OTP
3. Step 3: Enter new password & confirm → Reset password

**API Calls:**
- `otpApi.sendOTP({ mobileNumber, purpose: 'password_reset' })` - Send OTP
- `otpApi.verifyOTP({ mobileNumber, otp, purpose: 'password_reset' })` - Verify OTP
- `authApi.resetPassword({ mobileNumber, otp, newPassword })` - Reset password

---

### ForgotSubPassword.tsx
**Flow:**
1. Step 1: Enter mobile number → Send OTP
2. Step 2: Enter OTP → Verify OTP
3. Step 3: Enter new sub password & confirm → Reset sub password

**API Calls:**
- `otpApi.sendOTP({ mobileNumber, purpose: 'password_reset' })` - Send OTP
- `otpApi.verifyOTP({ mobileNumber, otp, purpose: 'password_reset' })` - Verify OTP
- `authApi.resetSubPassword({ mobileNumber, otp, newSubPassword })` - Reset sub password

---

## OTP Flow

### OTP Sending
**API:** `POST /api/otp/send`  
**Purpose:** `password_reset`

**Request:**
```json
{
  "mobileNumber": "9876543210",
  "purpose": "password_reset"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "mobileNumber": "9876543210",
    "expiresIn": 300
  }
}
```

### OTP Verification
**API:** `POST /api/otp/verify`  
**Purpose:** `password_reset`

**Request:**
```json
{
  "mobileNumber": "9876543210",
  "otp": "1234",
  "purpose": "password_reset"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully"
}
```

---

## Complete Request Flow

### Forgot Password Complete Flow:
```
User → Enter Mobile → Send OTP via SMS (BhashSMS) 
→ Enter OTP → Verify OTP → Enter New Password 
→ Call authApi.resetPassword() 
→ POST /auth/reset-password 
→ Backend verifies OTP, updates password 
→ Success response
```

### Forgot Sub Password Complete Flow:
```
User → Enter Mobile → Send OTP via SMS (BhashSMS) 
→ Enter OTP → Verify OTP → Enter New Sub Password 
→ Call authApi.resetSubPassword() 
→ POST /auth/reset-sub-password 
→ Backend verifies OTP, updates sub password 
→ Success response
```

---

## Summary

✅ **Backend:**
- 2 new controllers: `resetPasswordWithOTP`, `resetSubPasswordWithOTP`
- 2 new routes: `/reset-password`, `/reset-sub-password`
- Both are public routes (no authentication required)
- OTP verification is mandatory
- Password hashing is done before saving

✅ **Frontend:**
- 2 new API methods: `resetPassword()`, `resetSubPassword()`
- 2 new screens: `ForgotYourPassword.tsx`, `ForgotSubPassword.tsx`
- Both follow 3-step flow: Mobile → OTP → Reset Password
- Proper error handling and validation

✅ **Everything is connected and ready to use!**

