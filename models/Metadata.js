const mongoose = require('mongoose');

const MetadataSchema = new mongoose.Schema({
  iosCurrentVersion: {
    type: String,
  },
});

module.exports = mongoose.model('Metadata', MetadataSchema);
