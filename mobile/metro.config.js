const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const webShims = {
  'react-native-maps': path.resolve(__dirname, 'src/mocks/react-native-maps-web.ts'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webShims[moduleName]) {
    return { filePath: webShims[moduleName], type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
