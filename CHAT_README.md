# Bond Mate Chat System

## Overview
A comprehensive real-time chat system built with Socket.IO, featuring file sharing, emoji/sticker support, one-view messages, and real-time notifications.

## Features

### Backend Features
- **Real-time Messaging**: Socket.IO for instant message delivery
- **File Sharing**: Support for images, videos, audio, and documents
- **One-View Messages**: Messages that disappear after being viewed once
- **Emoji & Sticker Support**: Rich message types for better communication
- **Real-time Notifications**: Instant notifications for messages and partner requests
- **Typing Indicators**: Show when users are typing
- **Message Management**: Edit, delete, and reply to messages
- **Partner System**: Chat only with connected partners

### Frontend Features
- **Chat Modal**: Full-screen chat interface with smooth animations
- **File Upload**: Drag & drop and picker support for files
- **Emoji Picker**: Easy emoji selection interface
- **Sticker Support**: Fun sticker sharing
- **One-View Toggle**: Send disappearing messages
- **Real-time Updates**: Live message and notification updates
- **Responsive Design**: Works on all screen sizes

## API Endpoints

### Chat Endpoints
- `GET /api/chat/chats` - Get user's chats
- `GET /api/chat/chat/:partnerId` - Get or create chat with partner
- `GET /api/chat/chat/:chatId/messages` - Get chat messages
- `POST /api/chat/send` - Send message
- `PUT /api/chat/message/:messageId/viewed` - Mark message as viewed
- `PUT /api/chat/message/:messageId/edit` - Edit message
- `DELETE /api/chat/message/:messageId` - Delete message

### File Endpoints
- `POST /api/chat/upload` - Upload file
- `GET /api/uploads/:filename` - Get file
- `DELETE /api/chat/file/:messageId` - Delete file

### Notification Endpoints
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:notificationId/read` - Mark notification as read
- `PUT /api/notifications/read-all` - Mark all notifications as read
- `DELETE /api/notifications/:notificationId` - Delete notification
- `DELETE /api/notifications` - Clear all notifications

## Socket.IO Events

### Client to Server
- `join_chat` - Join a chat room
- `leave_chat` - Leave a chat room
- `send_message` - Send a message
- `file_uploaded` - Notify file upload
- `message_viewed` - Mark message as viewed
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `partner_request_sent` - Send partner request notification
- `partner_request_response` - Send partner request response notification

### Server to Client
- `new_message` - New message received
- `file_shared` - File shared notification
- `message_viewed` - Message viewed notification
- `user_typing` - User typing indicator
- `notification` - Real-time notification
- `error` - Error message

## Test Users

The system includes test users for development:

### User 1 (John Doe)
- Email: `test1@example.com`
- Password: `password123`
- Partner: Sarah Smith

### User 2 (Sarah Smith)
- Email: `test2@example.com`
- Password: `password123`
- Partner: John Doe

### User 3 (Mike Johnson)
- Email: `test3@example.com`
- Password: `password123`
- Status: Single (has pending request to John)

## Usage

### Starting the Backend
```bash
cd Bond-Mate-Backend
npm run dev
```

### Starting the Frontend
```bash
cd Bond-Mate-Client
npm start
```

### Testing Chat
1. Login with test1@example.com (John)
2. You should see "Connected with Sarah Smith" on homepage
3. Click on "Chat with Partner" to open chat modal
4. Send messages, emojis, stickers, and files
5. Test one-view messages by toggling the eye icon

## File Upload

The system supports various file types:
- **Images**: JPEG, PNG, GIF, WebP
- **Videos**: MP4, QuickTime, AVI
- **Audio**: MP3, WAV, OGG
- **Documents**: PDF, TXT, DOC, DOCX

Files are stored in the `uploads/` directory and served via `/uploads/:filename` endpoint.

## Security

- JWT authentication required for all endpoints
- File type validation and size limits (50MB max)
- User can only chat with their connected partner
- One-view messages are tracked and can only be viewed once

## Database Models

### Chat
- `participants`: Array of user IDs
- `lastMessage`: Reference to last message
- `lastMessageAt`: Timestamp of last message
- `isActive`: Chat status

### Message
- `chatId`: Reference to chat
- `senderId`: Reference to sender
- `content`: Message content
- `type`: Message type (text, image, video, etc.)
- `fileUrl`: File URL for file messages
- `isOneView`: One-view message flag
- `viewedBy`: Array of users who viewed the message
- `replyTo`: Reference to replied message

### Notification
- `userId`: Reference to user
- `type`: Notification type
- `title`: Notification title
- `message`: Notification message
- `data`: Additional data
- `isRead`: Read status

## Environment Variables

```env
MONGODB_URI=mongodb://192.168.220.66:27017/bond-mate
JWT_SECRET=your-jwt-secret
CLIENT_URL=http://192.168.220.66:8081
PORT=3000
```

## Development Notes

- Socket.IO server runs on the same port as the API
- CORS is configured for the client URL
- File uploads use multer with disk storage
- Real-time notifications are sent via Socket.IO
- Partner relationships are required for chat access
