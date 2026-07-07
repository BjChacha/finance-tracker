const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql'); // drizzle SQL 迁移随 bundle 分发

module.exports = config;
