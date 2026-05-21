require('dotenv').config();

// Use the Supabase storage adapter exclusively
module.exports = require('./storage.supabase');
