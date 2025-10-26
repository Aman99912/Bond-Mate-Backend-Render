import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  mobileNumber?: string;
  subPassword?: string;
  avatar?: string;
  bio?: string;
  isActive: boolean;
  dob?: Date;
  gender?: string;
  UserSearchId?: string;
  relationshipStatus?: string;
  relationshipSince?: Date;
  relationshipEndedAt?: Date;
  relationshipEndedReason?: string;
  relationshipEndedBy?: string;

  // Partner relationships
  currentPartner?: {
    partnerId: string;
    partnerName: string;
    partnerEmail: string;
    partnerAvatar?: string;
    startedAt: Date;
  };
  partnerHistory?: Array<{
    partnerId: string;
    partnerName: string;
    partnerEmail: string;
    partnerAvatar?: string;
    startedAt: Date;
    endedAt?: Date;
    endedBy?: string;
    endedReason?: string;
  }>;

  // New partner system
  partners?: Array<{
    partnerId: string;
    partnerName: string;
    partnerEmail: string;
    partnerAvatar?: string;
    partnerAge?: number;
    partnerGender?: string;
    startedAt: Date;
    status: 'active' | 'inactive';
    endedAt?: Date;
    endedBy?: string;
    endedReason?: string;
  }>;
  
  // Ex-Partners (former partners)
  exPartners?: Array<{
    partnerId: string;
    partnerName: string;
    partnerEmail: string;
    partnerAvatar?: string;
    partnerAge?: number;
    partnerGender?: string;
    startedAt: Date;
    endedAt: Date;
    endedBy: string;
    endedReason: string;
    breakupDate?: Date; // Store original breakup date for 30-day restoration
    dataArchived?: boolean; // Flag to track if data was archived after 30 days
  }>;

  // Push notification token
  pushToken?: string;
  pendingRequests?: Array<{
    requestId: string;
    fromUserId: string;
    fromUserName: string;
    fromUserEmail: string;
    fromUserAvatar?: string;
    fromUserAge?: number;
    fromUserGender?: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
  }>;

  // Device tracking for single device login
  currentDeviceId?: string;
  currentDeviceInfo?: {
    deviceId: string;
    deviceName?: string;
    platform?: string;
    lastLoginAt: Date;
    fcmToken?: string;
  };
  loginHistory?: Array<{
    deviceId: string;
    deviceName?: string;
    platform?: string;
    loginAt: Date;
    logoutAt?: Date;
    fcmToken?: string;
  }>;

  // Location tracking
  lastLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    updatedAt: Date;
  };

  // Streak tracking for couples app
  streakDays: number;
  streakUpdatedAt: Date;
  lastLogin: Date;
  profileCompletionPercentage: number;
  lastInteractionDate?: Date;
  notifications: string[];

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  mobileNumber: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values but enforces uniqueness for non-null values
    trim: true,
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid mobile number']
  },
  subPassword: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot be more than 500 characters'],
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  dob: {
    type: Date,
    validate: {
      validator: function(value: Date) {
        return !value || value < new Date();
      },
      message: 'Date of birth must be in the past'
    }
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    trim: true
  },

  UserSearchId: {
    type: String,
    trim: true
  },
  relationshipStatus: {
    type: String,
    enum: ['single', 'in a relationship', 'engaged', 'married', 'complicated'],
    trim: true
  },
  relationshipSince: {
    type: Date,
    trim: true
  },
  relationshipEndedAt: {
    type: Date,
    trim: true
  },
  relationshipEndedReason: {
    type: String,
    trim: true
  },
  relationshipEndedBy: {
    type: String,
    trim: true
  },

  // Partner relationships
  currentPartner: {
    partnerId: {
      type: String,
      ref: 'User'
    },
    partnerName: {
      type: String,
      trim: true
    },
    partnerEmail: {
      type: String,
      trim: true
    },
    partnerAvatar: {
      type: String,
      trim: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    }
  },
  partnerHistory: [{
    partnerId: {
      type: String,
      ref: 'User'
    },
    partnerName: {
      type: String,
      trim: true
    },
    partnerEmail: {
      type: String,
      trim: true
    },
    partnerAvatar: {
      type: String,
      trim: true
    },
    startedAt: {
      type: Date,
      required: true
    },
    endedAt: {
      type: Date
    },
    endedBy: {
      type: String,
      ref: 'User'
    },
    endedReason: {
      type: String,
      trim: true
    }
  }],

  // New partner system
  partners: [{
    partnerId: {
      type: String,
      ref: 'User',
      required: true
    },
    partnerName: {
      type: String,
      required: true,
      trim: true
    },
    partnerEmail: {
      type: String,
      required: true,
      trim: true
    },
    partnerAvatar: {
      type: String,
      trim: true
    },
    partnerAge: {
      type: Number
    },
    partnerGender: {
      type: String,
      enum: ['male', 'female', 'other']
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    endedAt: {
      type: Date
    },
    endedBy: {
      type: String,
      ref: 'User'
    },
    endedReason: {
      type: String,
      trim: true
    }
  }],
  exPartners: [{
    partnerId: {
      type: String,
      ref: 'User',
      required: true
    },
    partnerName: {
      type: String,
      required: true,
      trim: true
    },
    partnerEmail: {
      type: String,
      required: true,
      trim: true
    },
    partnerAvatar: {
      type: String,
      trim: true
    },
    partnerAge: {
      type: Number
    },
    partnerGender: {
      type: String,
      enum: ['male', 'female', 'other']
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: {
      type: Date,
      required: true
    },
    endedBy: {
      type: String,
      ref: 'User',
      required: true
    },
    endedReason: {
      type: String,
      trim: true,
      required: true
    },
    breakupDate: {
      type: Date,
      default: Date.now // Store original breakup date for 30-day restoration
    },
    dataArchived: {
      type: Boolean,
      default: false // Flag to track if data was archived after 30 days
    }
  }],
  pendingRequests: [{
    requestId: {
      type: String,
      required: true
    },
    fromUserId: {
      type: String,
      ref: 'User',
      required: true
    },
    fromUserName: {
      type: String,
      required: true,
      trim: true
    },
    fromUserEmail: {
      type: String,
      required: true,
      trim: true
    },
    fromUserAvatar: {
      type: String,
      trim: true
    },
    fromUserAge: {
      type: Number
    },
    fromUserGender: {
      type: String,
      enum: ['male', 'female', 'other']
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Push notification token
  pushToken: {
    type: String,
    trim: true
  },

  // Device tracking fields
  currentDeviceId: {
    type: String,
    trim: true
  },
  currentDeviceInfo: {
    deviceId: {
      type: String,
      required: false,
      trim: true
    },
    deviceName: {
      type: String,
      trim: true
    },
    platform: {
      type: String, 
      enum: ['ios', 'android', 'web'],
      trim: true,
      default: 'web'
    },
    lastLoginAt: {
      type: Date,
      default: Date.now
    },
    fcmToken: {
      type: String,
      trim: true
    }
  },
  loginHistory: [{
    deviceId: {
      type: String,
      required: true,
      trim: true
    },
    deviceName: {
      type: String,
      trim: true
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      trim: true,
      default: 'web'
    },
    loginAt: {
      type: Date,
      default: Date.now
    },
    logoutAt: {
      type: Date
    },
    fcmToken: {
      type: String,
      trim: true
    }
  }],

  // Location tracking
  lastLocation: {
    latitude: {
      type: Number,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180
    },
    accuracy: {
      type: Number,
      min: 0
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },

  // Streak tracking for couples app
  streakDays: {
    type: Number,
    default: 0,
    min: 0
  },
  streakUpdatedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  profileCompletionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  lastInteractionDate: {
    type: Date
  },
  notifications: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      if (Object.prototype.hasOwnProperty.call(ret, 'password')) delete (ret as any).password;
      if (Object.prototype.hasOwnProperty.call(ret, 'subPassword')) delete (ret as any).subPassword;
      if (Object.prototype.hasOwnProperty.call(ret, '__v')) delete (ret as any).__v;
      return ret;
    }
  }
});

// Pre-save hook to clean up invalid platform values
UserSchema.pre('save', function(next) {
  const validPlatforms = ['ios', 'android', 'web'];
  
  // Clean up currentDeviceInfo platform
  if (this.currentDeviceInfo?.platform && !validPlatforms.includes(this.currentDeviceInfo.platform)) {
    this.currentDeviceInfo.platform = 'web';
  }
  
  // Clean up loginHistory platform values
  if (this.loginHistory && Array.isArray(this.loginHistory)) {
    this.loginHistory.forEach(entry => {
      if (entry.platform && !validPlatforms.includes(entry.platform)) {
        entry.platform = 'web';
      }
    });
  }
  
  next();
});

// Index for better query performance
// Note: email and mobileNumber already have unique indexes from the schema definition
UserSchema.index({ isActive: 1 });
UserSchema.index({ currentDeviceId: 1 });

export default mongoose.model<IUser>('User', UserSchema);
