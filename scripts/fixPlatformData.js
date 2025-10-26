const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bondmate', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const UserSchema = new mongoose.Schema({
  currentDeviceInfo: {
    platform: String
  },
  loginHistory: [{
    platform: String
  }]
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function fixPlatformData() {
  try {
    console.log('🔧 Starting platform data migration...');
    
    // Find all users with invalid platform values
    const users = await User.find({
      $or: [
        { 'currentDeviceInfo.platform': { $nin: ['ios', 'android', 'web'] } },
        { 'loginHistory.platform': { $nin: ['ios', 'android', 'web'] } }
      ]
    });

    console.log(`📊 Found ${users.length} users with invalid platform data`);

    let updatedCount = 0;

    for (const user of users) {
      let needsUpdate = false;

      // Fix currentDeviceInfo platform
      if (user.currentDeviceInfo?.platform && !['ios', 'android', 'web'].includes(user.currentDeviceInfo.platform)) {
        user.currentDeviceInfo.platform = 'web';
        needsUpdate = true;
        console.log(`✅ Fixed currentDeviceInfo platform for user ${user._id}`);
      }

      // Fix loginHistory platform values
      if (user.loginHistory && Array.isArray(user.loginHistory)) {
        user.loginHistory.forEach((entry, index) => {
          if (entry.platform && !['ios', 'android', 'web'].includes(entry.platform)) {
            entry.platform = 'web';
            needsUpdate = true;
            console.log(`✅ Fixed loginHistory[${index}] platform for user ${user._id}`);
          }
        });
      }

      if (needsUpdate) {
        await user.save();
        updatedCount++;
      }
    }

    console.log(`🎉 Migration completed! Updated ${updatedCount} users`);
    console.log('✅ All platform data is now valid');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the migration
fixPlatformData();
