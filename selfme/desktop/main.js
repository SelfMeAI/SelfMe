const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let gatewayProcess = null;
let config = null;

// Get config file path
function getConfigPath() {
  // Use config.json in the same directory as the executable
  const appDir = app.isPackaged
    ? path.dirname(process.execPath)
    : __dirname;
  return path.join(appDir, 'config.json');
}

// Load configuration
function loadConfig() {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    // Create default config
    const defaultConfig = {
      gateway_url: 'http://localhost:8000',
      window: {
        width: 1200,
        height: 800
      }
    };

    try {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      console.log('Created default config:', configPath);
    } catch (error) {
      console.error('Failed to create config file:', error);
    }

    return defaultConfig;
  }

  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Failed to load config:', error);
    return {
      gateway_url: 'http://localhost:8000',
      window: { width: 1200, height: 800 }
    };
  }
}

// Check if Gateway is running
function checkGateway(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 8000,
      path: '/health',
      method: 'GET',
      timeout: 2000
    };

    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// Check if URL is localhost
function isLocalhost(url) {
  const hostname = new URL(url).hostname;
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

// Start local Gateway
function startLocalGateway() {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(config.gateway_url);
    const port = urlObj.port || 8000;

    // Find Python executable
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    // Start Gateway process
    gatewayProcess = spawn(pythonCmd, ['-m', 'selfme', 'gateway', '--port', port], {
      detached: false,
      stdio: 'pipe'
    });

    gatewayProcess.on('error', (error) => {
      console.error('Failed to start Gateway:', error);
      reject(error);
    });

    // Wait for Gateway to start
    let attempts = 0;
    const maxAttempts = 10;

    const checkInterval = setInterval(async () => {
      attempts++;
      const isRunning = await checkGateway(config.gateway_url);

      if (isRunning) {
        clearInterval(checkInterval);
        console.log('Gateway started successfully');
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        reject(new Error('Gateway failed to start'));
      }
    }, 1000);
  });
}

// Create main window
function createWindow() {
  const windowConfig = config.window || { width: 1200, height: 800 };

  mainWindow = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icon.png')
  });

  // Load the app
  const distPath = path.join(__dirname, 'dist', 'index.html');
  mainWindow.loadFile(distPath);

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Show connection error dialog
async function showConnectionError(gatewayUrl) {
  const isLocal = isLocalhost(gatewayUrl);

  const options = {
    type: 'error',
    title: 'Gateway Connection Failed',
    message: `Cannot connect to Gateway:\n${gatewayUrl}`,
    buttons: isLocal
      ? ['Start Local Gateway', 'Open Config', 'Retry', 'Exit']
      : ['Open Config', 'Retry', 'Exit'],
    defaultId: 0,
    cancelId: isLocal ? 3 : 2
  };

  const { response } = await dialog.showMessageBox(options);

  if (isLocal) {
    if (response === 0) {
      // Start Local Gateway
      try {
        await startLocalGateway();
        createWindow();
      } catch (error) {
        await dialog.showErrorBox('Failed to Start Gateway', error.message);
        app.quit();
      }
    } else if (response === 1) {
      // Open Config
      shell.openPath(getConfigPath());
      app.quit();
    } else if (response === 2) {
      // Retry
      await initializeApp();
    } else {
      // Exit
      app.quit();
    }
  } else {
    if (response === 0) {
      // Open Config
      shell.openPath(getConfigPath());
      app.quit();
    } else if (response === 1) {
      // Retry
      await initializeApp();
    } else {
      // Exit
      app.quit();
    }
  }
}

// Initialize app
async function initializeApp() {
  // Load config
  config = loadConfig();
  console.log('Config loaded:', config);

  // Check Gateway connection
  const isConnected = await checkGateway(config.gateway_url);

  if (isConnected) {
    console.log('Gateway is running');
    createWindow();
  } else {
    console.log('Gateway is not running');
    await showConnectionError(config.gateway_url);
  }
}

// App ready
app.whenReady().then(initializeApp);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up on quit
app.on('before-quit', () => {
  if (gatewayProcess) {
    console.log('Stopping Gateway process...');
    gatewayProcess.kill();
  }
});

// IPC handlers
ipcMain.handle('get-config', () => {
  return config;
});

ipcMain.handle('open-config', () => {
  shell.openPath(getConfigPath());
});
