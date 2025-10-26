import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import Chat from '@/models/Chat';
import Message from '@/models/Message';
import Notification from '@/models/Notification';
import { IUser } from '@/models/User';
import { config } from '@/config/env';

interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

interface AuthenticatedSocket extends Socket {
  user?: IUser;
}

export class SocketHandler {
  private io: SocketIOServer;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*', // Allow all origins for development
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: Socket, next) => {
      try {
        console.log('🔐 Socket authentication attempt...');
        
        const token = (socket.handshake.auth as any)?.token || 
                     socket.handshake.headers.authorization?.split(' ')[1];
        
        console.log('🔑 Token found:', !!token);
        console.log('🔑 Token length:', token?.length || 0);
        
        if (!token) {
          console.log('❌ No token provided');
          return next(new Error('Authentication error: No token provided'));
        }

        console.log('🔍 Verifying token...');
        const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
        console.log('✅ Token decoded successfully:', { userId: decoded.userId, email: decoded.email });
        
        console.log('👤 Looking up user:', decoded.userId);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
          console.log('❌ User not found:', decoded.userId);
          return next(new Error('Authentication error: User not found'));
        }

        console.log('✅ User found:', user.name, user.email);
        (socket as AuthenticatedSocket).user = user;
        next();
      } catch (error) {
        console.error('❌ Socket authentication error:', error);
        if (error instanceof jwt.TokenExpiredError) {
          next(new Error('Authentication error: Token expired'));
        } else if (error instanceof jwt.JsonWebTokenError) {
          next(new Error('Authentication error: Invalid token'));
        } else {
          next(new Error('Authentication error: Token verification failed'));
        }
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      const authSocket = socket as AuthenticatedSocket;
      console.log(`User ${authSocket.user?.name} connected: ${socket.id}`);

      // Store user connection
      if (authSocket.user) {
        this.connectedUsers.set((authSocket.user._id as any).toString(), socket.id);
        
        // Notify partner that user is online
        this.notifyPartnerOnlineStatus((authSocket.user._id as any).toString(), true);
      }

      // Join user to their personal room
      if (authSocket.user) {
        socket.join(`user_${authSocket.user._id}`);
        console.log(`User ${authSocket.user.name} joined personal room: user_${authSocket.user._id}`);
      }

      // Handle joining chat room
      socket.on('join_room', (roomName: string) => {
        socket.join(roomName);
        console.log(`User ${authSocket.user?.name} joined room ${roomName}`);
      });

      // Handle joining chat room (specific for chat)
      socket.on('join_chat', (chatId: string) => {
        socket.join(`chat_${chatId}`);
        console.log(`User ${authSocket.user?.name} joined chat room: chat_${chatId}`);
      });

      // Handle leaving chat room
      socket.on('leave_room', (roomName: string) => {
        socket.leave(roomName);
        console.log(`User ${authSocket.user?.name} left room ${roomName}`);
      });

      // Handle leaving chat room (specific for chat)
      socket.on('leave_chat', (chatId: string) => {
        socket.leave(`chat_${chatId}`);
        console.log(`User ${authSocket.user?.name} left chat room: chat_${chatId}`);
      });

      // Handle sending message
      socket.on('send_message', async (data: {
        chatId: string;
        content: string;
        type: string;
        replyTo?: string;
        isOneView?: boolean;
      }) => {
        try {
          if (!authSocket.user) return;

          const { chatId, content, type, replyTo, isOneView } = data;

          // Verify user is participant in chat
          const chat = await Chat.findById(chatId);
          if (!chat || !authSocket.user || !chat.participants.some(p => p.toString() === (authSocket.user!._id as any).toString())) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }

          // Create message
          const message = await Message.create({
            chatId,
            senderId: authSocket.user._id,
            content,
            type,
            replyTo,
            isOneView
          });

          await message.populate('senderId', 'name avatar');

          // Update chat last message
          chat.lastMessage = message._id as any;
          chat.lastMessageAt = new Date();
          await chat.save();

          // Get other participant
          const otherParticipant = chat.participants.find(p => p.toString() !== (authSocket.user!._id as any).toString());

          // Send message to all participants in the chat
          this.io.to(`chat_${chatId}`).emit('new_message', {
            chatId,
            message
          });

          // Create notification for other participant
          if (otherParticipant) {
            await Notification.create({
              userId: otherParticipant,
              type: 'message',
              title: 'New Message',
              message: type === 'text' ? content : `Sent a ${type}`,
              data: { chatId, messageId: message._id }
            });

            // Send real-time notification
            this.io.to(`user_${otherParticipant}`).emit('notification', {
              type: 'message',
              title: 'New Message',
              message: type === 'text' ? content : `Sent a ${type}`,
              data: { chatId, messageId: message._id }
            });
          }
        } catch (error) {
          console.error('Error sending message:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle file upload
      socket.on('file_uploaded', async (data: {
        chatId: string;
        messageId: string;
        fileType: string;
        fileName: string;
        isOneView?: boolean;
      }) => {
        try {
          if (!authSocket.user) return;

          const { chatId, messageId, fileType, fileName, isOneView } = data;

          // Verify user is participant in chat
          const chat = await Chat.findById(chatId);
          if (!chat || !authSocket.user || !chat.participants.some(p => p.toString() === (authSocket.user!._id as any).toString())) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }

          // Get other participant
          const otherParticipant = chat.participants.find(p => p.toString() !== (authSocket.user!._id as any).toString());

          // Send file message to all participants in the chat
          this.io.to(`chat_${chatId}`).emit('file_shared', {
            messageId,
            chatId,
            fileType,
            fileName,
            isOneView
          });

          // Create notification for other participant
          if (otherParticipant) {
            await Notification.create({
              userId: otherParticipant,
              type: 'file_shared',
              title: 'File Shared',
              message: `${fileType.charAt(0).toUpperCase() + fileType.slice(1)} shared`,
              data: { chatId, messageId, fileType }
            });

            // Send real-time notification
            this.io.to(`user_${otherParticipant}`).emit('notification', {
              type: 'file_shared',
              title: 'File Shared',
              message: `${fileType.charAt(0).toUpperCase() + fileType.slice(1)} shared`,
              data: { chatId, messageId, fileType }
            });
          }
        } catch (error) {
          console.error('Error handling file upload:', error);
          socket.emit('error', { message: 'Failed to handle file upload' });
        }
      });

      // Handle message viewed (for one-view messages)
      socket.on('message_viewed', async (data: { messageId: string; chatId: string }) => {
        try {
          if (!authSocket.user) return;

          const { messageId, chatId } = data;

          const message = await Message.findById(messageId);
          if (!message) return;

          // Check if user is participant in the chat
          const chat = await Chat.findById(chatId);
          if (!chat || !authSocket.user || !chat.participants.some(p => p.toString() === (authSocket.user!._id as any).toString())) return;

          // Check if already viewed
          if (message.viewedBy?.some(id => id.toString() === (authSocket.user!._id as any).toString())) return;

          // Mark as viewed
          message.viewedBy = message.viewedBy || [];
          message.viewedBy.push(authSocket.user._id as any);
          message.viewedAt = new Date();
          await message.save();

          // Notify sender that message was viewed
          const senderSocketId = this.connectedUsers.get(message.senderId.toString());
          if (senderSocketId) {
            this.io.to(senderSocketId).emit('message_viewed', {
              messageId,
              viewedBy: authSocket.user.name,
              viewedAt: message.viewedAt
            });
          }

          // Create notification for sender
          await Notification.create({
            userId: message.senderId,
            type: 'one_view_opened',
            title: 'Message Viewed',
            message: `${authSocket.user.name} viewed your message`,
            data: { messageId, chatId }
          });
        } catch (error) {
          console.error('Error marking message as viewed:', error);
        }
      });

      // Handle user online status
      socket.on('user_online', (data: { userId: string }) => {
        console.log('👤 User online event received:', data);
        if (authSocket.user) {
          this.connectedUsers.set((authSocket.user._id as any).toString(), socket.id);
          this.notifyPartnerOnlineStatus((authSocket.user._id as any).toString(), true);
        }
      });

      // Handle get partner status
      socket.on('get_partner_status', async (data: { partnerId: string }) => {
        console.log('👤 Get partner status request:', data);
        if (authSocket.user) {
          const partnerId = data.partnerId;
          const isOnline = this.connectedUsers.has(partnerId);
          
          // Get partner's last seen if offline
          let lastSeen = undefined;
          if (!isOnline) {
            try {
              const partner = await User.findById(partnerId);
              lastSeen = (partner as any)?.lastSeen || new Date().toISOString();
            } catch (error) {
              console.error('Error getting partner last seen:', error);
            }
          }
          
          socket.emit('partner_status_response', {
            partnerId,
            isOnline,
            lastSeen
          });
          console.log(`Partner ${partnerId} status: ${isOnline ? 'Online' : 'Offline'}`);
        }
      });

      // Handle typing indicators
      socket.on('typing_start', (data: { chatId: string, userId: string }) => {
        socket.to(`chat_${data.chatId}`).emit('typing_start', {
          chatId: data.chatId,
          userId: data.userId,
          userName: authSocket.user?.name
        });
      });

      socket.on('typing_stop', (data: { chatId: string, userId: string }) => {
        socket.to(`chat_${data.chatId}`).emit('typing_stop', {
          chatId: data.chatId,
          userId: data.userId,
          userName: authSocket.user?.name
        });
      });

      // Handle partner request notifications
      socket.on('partner_request_sent', async (data: {
        toUserId: string;
        fromUserId: string;
        requestId: string;
      }) => {
        try {
          const { toUserId, fromUserId, requestId } = data;

          // Send real-time notification to target user
          this.io.to(`user_${toUserId}`).emit('notification', {
            type: 'partner_request',
            title: 'Partner Request',
            message: 'You have a new partner request',
            data: { requestId, fromUserId }
          });
        } catch (error) {
          console.error('Error sending partner request notification:', error);
        }
      });

      // Handle partner request response notifications
      socket.on('partner_request_response', async (data: {
        toUserId: string;
        fromUserId: string;
        status: 'accepted' | 'rejected';
      }) => {
        try {
          const { toUserId, fromUserId, status } = data;

          // Send real-time notification
          this.io.to(`user_${toUserId}`).emit('notification', {
            type: status === 'accepted' ? 'partner_accepted' : 'partner_rejected',
            title: status === 'accepted' ? 'Partner Request Accepted' : 'Partner Request Rejected',
            message: status === 'accepted' 
              ? 'Your partner request was accepted!' 
              : 'Your partner request was rejected',
            data: { fromUserId, status }
          });
        } catch (error) {
          console.error('Error sending partner request response notification:', error);
        }
      });

      // Handle location sharing
      socket.on('share_location', async (data: {
        latitude: number;
        longitude: number;
        accuracy?: number;
        timestamp?: number;
      }) => {
        try {
          if (!authSocket.user) return;

          console.log('📍 Location shared by:', authSocket.user.name, data);

          // Get user's partner
          const user = await User.findById(authSocket.user._id);
          if (!user) return;

          // Check for active partner
          const activePartner = user?.partners?.find((partner: any) => partner.status === 'active');
          if (!activePartner?.partnerId) {
            socket.emit('error', { message: 'No partner found' });
            return;
          }

          const partnerId = activePartner.partnerId;

          // Send location to partner
          this.io.to(`user_${partnerId}`).emit('partner_location_update', {
            userId: authSocket.user._id,
            userName: authSocket.user.name,
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy,
            timestamp: data.timestamp || Date.now()
          });

          console.log(`📍 Location sent to partner ${partnerId}`);
        } catch (error) {
          console.error('Error sharing location:', error);
          socket.emit('error', { message: 'Failed to share location' });
        }
      });

      // Handle location request
      socket.on('request_location', async (data: { partnerId: string }) => {
        try {
          if (!authSocket.user) return;

          console.log('📍 Location requested by:', authSocket.user.name, 'from partner:', data.partnerId);

          // Send location request to partner
          this.io.to(`user_${data.partnerId}`).emit('location_request', {
            fromUserId: authSocket.user._id,
            fromUserName: authSocket.user.name,
            timestamp: Date.now()
          });

          console.log(`📍 Location request sent to partner ${data.partnerId}`);
        } catch (error) {
          console.error('Error requesting location:', error);
          socket.emit('error', { message: 'Failed to request location' });
        }
      });

      // Handle test connection
      socket.on('test_connection', (data: any) => {
        console.log('🧪 Test connection received from:', authSocket.user?.name, data);
        socket.emit('test_connection_response', {
          message: 'Test connection successful',
          serverTime: new Date().toISOString(),
          user: authSocket.user?.name
        });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User ${authSocket.user?.name} disconnected: ${socket.id}`);
        
        // Remove user from connected users and notify partner
        if (authSocket.user) {
          this.connectedUsers.delete((authSocket.user._id as any).toString());
          
          // Notify partner that user is offline
          this.notifyPartnerOnlineStatus((authSocket.user._id as any).toString(), false);
        }
      });
    });
  }

  // Method to send notification to specific user
  public sendNotificationToUser(userId: string, notification: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('notification', notification);
    }
  }

  // Method to notify partner about online status
  private async notifyPartnerOnlineStatus(userId: string, isOnline: boolean) {
    try {
      // Find the user's current partner
      const user = await User.findById(userId).populate('currentPartner.partnerId', 'name');
      if (user && user.currentPartner && user.currentPartner.partnerId) {
        // partnerId is a string in the schema, but populated as an object
        let partnerId: string;
        let partnerName: string;
        
        if (typeof user.currentPartner.partnerId === 'string') {
          partnerId = user.currentPartner.partnerId;
          partnerName = 'Unknown';
        } else {
          const populatedPartner = user.currentPartner.partnerId as any;
          partnerId = populatedPartner._id?.toString() || populatedPartner.toString();
          partnerName = populatedPartner.name || 'Unknown';
        }
        
        const partnerSocketId = this.connectedUsers.get(partnerId);
        
        if (partnerSocketId) {
          const eventName = isOnline ? 'partner_online' : 'partner_offline';
          const data = {
            partnerId: userId,
            partnerName: user.name,
            lastSeen: isOnline ? undefined : new Date().toISOString()
          };
          
          this.io.to(partnerSocketId).emit(eventName, data);
          console.log(`Notified partner ${partnerName} that user ${user.name} is ${isOnline ? 'online' : 'offline'}`);

          // Also emit user_status_update for better compatibility
          this.io.to(partnerSocketId).emit('user_status_update', {
            userId: userId,
            isOnline: isOnline,
            lastSeen: isOnline ? undefined : new Date().toISOString()
          });
          console.log(`Emitted user_status_update for partner ${partnerName}`);
        }
      }
    } catch (error) {
      console.error('Error notifying partner online status:', error);
    }
  }

  // Method to send message to chat
  public sendMessageToChat(chatId: string, message: any) {
    console.log('📡 sendMessageToChat called:', { chatId, message });
    // Only emit to chat room, not to individual users to prevent duplicates
    this.io.to(`chat_${chatId}`).emit('new_message', message);
    console.log('📡 Message emitted to chat room:', `chat_${chatId}`);
  }

  // Emit event to specific user
  public emitToUser(userId: string, event: string, data: any) {
    console.log('📡 emitToUser called:', { userId, event, data });
    this.io.to(`user_${userId}`).emit(event, data);
    console.log('📡 Event emitted to user:', `user_${userId}`);
  }

  // Emit to partner (both users in a relationship)
  emitToPartner(userId: string, event: string, data: any) {
    // This will be called from controllers to emit to both partners
    this.emitToUser(userId, event, data);
  }

  // Emit calendar update to partner
  emitCalendarUpdate(userId: string, action: string, data: any) {
    this.emitToUser(userId, 'calendar_update', {
      action,
      data,
      timestamp: new Date().toISOString()
    });
  }

  // Emit diary update to partner
  emitDiaryUpdate(userId: string, action: string, data: any) {
    this.emitToUser(userId, 'diary_update', {
      action,
      data,
      timestamp: new Date().toISOString()
    });
  }

  // Get the io instance (for backward compatibility)
  public get ioInstance() {
    return this.io;
  }
}

// Global instance
let socketHandlerInstance: SocketHandler | null = null;

export const initializeSocketHandler = (server: HTTPServer) => {
  socketHandlerInstance = new SocketHandler(server);
  return socketHandlerInstance;
};

export const getSocketHandler = () => {
  return socketHandlerInstance;
};

export default SocketHandler;