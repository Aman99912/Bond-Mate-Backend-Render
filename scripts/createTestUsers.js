const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../dist/models/User').default;
const { Partner, PartnerRequest } = require('../dist/models/Partner');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const createTestUsers = async () => {
  try {
    await connectDB();

    // Clear existing test users
    await User.deleteMany({ email: { $regex: /test.*@example\.com/ } });
    await Partner.deleteMany({});
    await PartnerRequest.deleteMany({});

    console.log('Cleared existing test data');

    // Create test user 1
    const hashedPassword1 = await bcrypt.hash('password123', 12);
    const user1 = await User.create({
      name: 'John Doe',
      email: 'test1@example.com',
      password: hashedPassword1,
      dob: '1995-05-15',
      gender: 'male',
      UserSearchId: 'john_doe_95',
      bio: 'Love hiking and photography',
      isActive: true,
      isEmailVerified: true
    });

    // Create test user 2
    const hashedPassword2 = await bcrypt.hash('password123', 12);
    const user2 = await User.create({
      name: 'Sarah Smith',
      email: 'test2@example.com',
      password: hashedPassword2,
      dob: '1997-08-22',
      gender: 'female',
      UserSearchId: 'sarah_smith_97',
      bio: 'Art lover and coffee enthusiast',
      isActive: true,
      isEmailVerified: true
    });

    console.log('Created test users:', { user1: user1.email, user2: user2.email });

    // Create partner relationship
    const partner = await Partner.create({
      user1Id: user1._id,
      user2Id: user2._id,
      status: 'active',
      startedAt: new Date()
    });

    // Update users with partner information
    await User.findByIdAndUpdate(user1._id, {
      $set: {
        currentPartner: {
          partnerId: user2._id,
          partnerName: user2.name,
          partnerEmail: user2.email,
          partnerAvatar: user2.avatar,
          startedAt: new Date()
        }
      }
    });

    await User.findByIdAndUpdate(user2._id, {
      $set: {
        currentPartner: {
          partnerId: user1._id,
          partnerName: user1.name,
          partnerEmail: user1.email,
          partnerAvatar: user1.avatar,
          startedAt: new Date()
        }
      }
    });

    console.log('Created partner relationship between users');

    // Create some sample partner requests for other users
    const hashedPassword3 = await bcrypt.hash('password123', 12);
    const user3 = await User.create({
      name: 'Mike Johnson',
      email: 'test3@example.com',
      password: hashedPassword3,
      dob: '1993-12-10',
      gender: 'male',
      UserSearchId: 'mike_johnson_93',
      bio: 'Fitness enthusiast and traveler',
      isActive: true,
      isEmailVerified: true
    });

    // Create a pending request from user3 to user1
    await PartnerRequest.create({
      fromUserId: user3._id,
      toUserId: user1._id,
      status: 'pending'
    });

    console.log('Created additional test user and partner request');

    console.log('\n=== Test Users Created ===');
    console.log('User 1 (John):', {
      email: 'test1@example.com',
      password: 'password123',
      userId: user1._id,
      partner: 'Sarah Smith'
    });
    console.log('User 2 (Sarah):', {
      email: 'test2@example.com',
      password: 'password123',
      userId: user2._id,
      partner: 'John Doe'
    });
    console.log('User 3 (Mike):', {
      email: 'test3@example.com',
      password: 'password123',
      userId: user3._id,
      status: 'Single (has pending request to John)'
    });

    console.log('\nYou can now test the chat functionality with John and Sarah!');
    console.log('Mike has a pending request to John that you can test notifications with.');

  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    mongoose.connection.close();
  }
};

createTestUsers();
