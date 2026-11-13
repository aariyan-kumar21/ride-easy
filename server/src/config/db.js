// In-memory mode: MongoDB and Mongoose are no longer used.
async function connectDB() {}
async function disconnectDB() {}
function maskMongoUri(uri) { return uri || ''; }

module.exports = { connectDB, disconnectDB, maskMongoUri };
