module.exports = {
  appId: 'com.drovo.pos',
  productName: 'DROVO POS',
  copyright: 'Copyright © 2025 DROVO',

  directories: {
    buildResources: 'build',
    output: 'release',
  },

  files: [
    'dist/**/*',
    'dist-electron/**/*',
    'electron/db/schema.sql',
    'package.json',
  ],

  extraResources: [
    { from: 'electron/db/schema.sql', to: 'schema.sql' },
  ],

  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
    icon: 'build/icon.ico',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'DROVO POS',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    license: null,
    language: '1025',  // Arabic
    multiLanguageInstaller: true,
  },

  publish: {
    provider: 'github',
    owner: 'drovo-pos',
    repo: 'drovo-pos-releases',
    releaseType: 'release',
  },

  electronVersion: '28.0.0',

  buildDependenciesFromSource: true,
};
