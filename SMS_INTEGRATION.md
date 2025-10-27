# SMS Integration with BhashSMS

## Overview
The OTP system has been integrated with BhashSMS API for sending SMS OTPs to user mobile numbers.

## Configuration

### Environment Variables
Add these to your `.env` file:

```env
# SMS Configuration for OTP (bhashsms.com)
SMS_USER=success
SMS_PASS=bulk@1234
SMS_SENDER=BHAINF
```

### How It Works

1. **OTP Generation & Storage**
   - When a user requests an OTP, a 4-digit code is generated
   - The OTP is stored in MongoDB with:
     - Mobile number
     - OTP code
     - Expiration time (5 minutes)
     - Type: 'mobile'

2. **SMS Sending**
   - The OTP is sent to the user's mobile number via BhashSMS API
   - URL Format: `https://bhashsms.com/api/sendmsg.php`
   - Message: "Your Bond Mate OTP is {otp}. This will expire in 5 minutes."

3. **OTP Verification**
   - User enters the received OTP
   - System verifies against the stored OTP in MongoDB
   - OTP is marked as used after successful verification
   - Expired OTPs are automatically rejected

## API Endpoints

### Send OTP
```
POST /api/otp/send
Body: { "mobileNumber": "9876543210" }
```

### Verify OTP
```
POST /api/otp/verify
Body: { "mobileNumber": "9876543210", "otp": "1234" }
```

### Resend OTP
```
POST /api/otp/resend
Body: { "mobileNumber": "9876543210" }
```

## Storage

The OTP is stored in MongoDB with the following schema:
- `mobileNumber`: The user's mobile number
- `otp`: The generated 4-digit OTP
- `type`: "mobile"
- `expiresAt`: Timestamp (5 minutes from generation)
- `isUsed`: Boolean flag
- `createdAt`: Timestamp

## Error Handling

- SMS sending errors are logged but don't block the OTP flow
- If SMS fails to send, the OTP is still stored and can be verified
- Users can still verify using the OTP stored in the database

## Testing

For development, you can use the dummy OTP `1111` to bypass SMS sending.

