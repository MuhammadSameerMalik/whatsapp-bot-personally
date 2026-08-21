const settings = {
  packname: 'Sam Bot',
  author: 'Sameer Malik',
  botName: "Sam",
  botOwner: 'Sameer Malik', 
  ownerNumber: '923238867440',
  maxStoreMessages: 1000,
  maxMessageAgeMs: 24 * 60 * 60 * 1000,
  storeWriteInterval: 10000,
  storeCleanupInterval: 60 * 1000,
  mediaCleanupInterval: 5 * 60 * 1000,
  watchdogInterval: 60 * 1000,
  autoClearInterval: 30 * 60 * 1000, // RAM housekeeping: flush caches + GC every 30 min
  reconnectDelayMs: 5000,
  description: "Automated WhatsApp Assistant",
  version: "2.2.0",
};

module.exports = settings;