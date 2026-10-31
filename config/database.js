const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const User = require('../models/user');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/exeat-system';
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    const indexes = await User.collection.indexes();
    const matriculationIndex = indexes.find((index) =>
      index.key.matriculationNumber === 1 && !index.sparse
    );
    if (matriculationIndex) {
      await User.collection.dropIndex(matriculationIndex.name);
      await User.collection.createIndex(
        { matriculationNumber: 1 },
        { unique: true, sparse: true, name: 'matriculationNumber_1' }
      );
      console.log('Repaired the matriculation number index to allow non-student accounts');
    }
    const migration = await User.updateMany({ role: 'warden' }, { $set: { role: 'portal' } });
    if (migration.modifiedCount > 0) {
      console.log(`Migrated ${migration.modifiedCount} warden account(s) to the portal role`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;