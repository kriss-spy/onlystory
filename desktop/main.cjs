const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session,
  dialog,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { SourceDownloader } = require('./source-downloader.cjs');
const { MediaConverter } = require('./media-converter.cjs');

const profile = process.argv.find((arg) =>
  arg.startsWith('--onlystory-profile='),
);
if (profile)
  app.setPath(
    'userData',
    path.resolve(profile.slice('--onlystory-profile='.length)),
  );
app.setAppUserModelId('app.onlystory.reader');
let mainWindow;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const root = path.join(__dirname, 'web');
      // Static loopback hosting runs inside this executable, costs nothing, and
      // needs no external service. Keep its origin stable for the saved library.
      const portFile = path.join(app.getPath('userData'), 'runtime-port.json');
      const port = fs.existsSync(portFile)
        ? JSON.parse(fs.readFileSync(portFile, 'utf8')).port
        : 0;
      const mime = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.wasm': 'application/wasm',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
        '.woff2': 'font/woff2',
      };
      const server = createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        if (!['GET', 'HEAD'].includes(request.method))
          return response.writeHead(405).end();
        if (url.pathname.startsWith('/private/'))
          return response.writeHead(404).end();
        let relative;
        try {
          relative = decodeURIComponent(url.pathname);
        } catch {
          return response.writeHead(400).end();
        }
        let file = path.resolve(root, '.' + relative);
        if (!file.startsWith(root + path.sep))
          return response.writeHead(403).end();
        if (!path.extname(relative)) file = path.join(root, 'index.html');
        if (!fs.existsSync(file) || !fs.statSync(file).isFile())
          return response.writeHead(404).end();
        response.setHeader(
          'Content-Type',
          mime[path.extname(file)] || 'application/octet-stream',
        );
        response.setHeader('Content-Length', fs.statSync(file).size);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        const codecWorker = /^worker-.*\.js$/.test(path.basename(file));
        response.setHeader(
          'Content-Security-Policy',
          `default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'${codecWorker ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https: blob:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'`,
        );
        if (request.method === 'HEAD') return response.end();
        fs.createReadStream(file).pipe(response);
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      fs.writeFileSync(
        portFile,
        JSON.stringify({ port: server.address().port }),
      );
      const developmentUrl = process.env.ONLYSTORY_DEV_URL;
      if (developmentUrl) {
        const url = new URL(developmentUrl);
        if (
          app.isPackaged ||
          url.protocol !== 'http:' ||
          !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
          url.username ||
          url.password
        )
          throw Error('Development URL must use a local HTTP server.');
      }
      const ORIGIN = developmentUrl
        ? new URL(developmentUrl).origin
        : `http://127.0.0.1:${server.address().port}`;
      app.on('before-quit', () => {
        server.closeAllConnections();
        server.close();
      });
      const downloader = new SourceDownloader(
        path.join(app.getPath('userData'), 'originals'),
        JSON.parse(
          fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'),
        ),
      );
      const converter = new MediaConverter(
        path.join(app.getPath('userData'), 'converted'),
        JSON.parse(
          fs.readFileSync(
            path.join(__dirname, 'native-transforms.json'),
            'utf8',
          ),
        ),
        path.join(
          __dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked'),
          'tools',
          process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
        ),
      );
      const trusted = (event) => {
        if (
          !mainWindow ||
          event.sender !== mainWindow.webContents ||
          event.senderFrame !== event.sender.mainFrame ||
          !event.senderFrame.url.startsWith(ORIGIN + '/')
        )
          throw Error('Untrusted download request.');
      };
      ipcMain.handle('onlystory:original', (event, id) => {
        trusted(event);
        return downloader.read(id);
      });
      ipcMain.handle('onlystory:cancel', (event) => {
        trusted(event);
        downloader.cancel();
        converter.cancel();
      });
      ipcMain.handle('onlystory:convert', (event, id, inputs) => {
        trusted(event);
        return converter.read(id, inputs);
      });
      const permissions = session.defaultSession;
      permissions.setPermissionRequestHandler(
        (_contents, permission, callback) =>
          callback(permission === 'fullscreen'),
      );
      permissions.setPermissionCheckHandler(
        (_contents, permission) => permission === 'fullscreen',
      );
      mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 700,
        minHeight: 500,
        title: 'Onlystory',
        icon: path.join(__dirname, 'icon.ico'),
        backgroundColor: '#151d20',
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      mainWindow.setMenu(null);
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https:\/\//.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
      });
      mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(ORIGIN + '/')) event.preventDefault();
      });
      mainWindow.on('closed', () => {
        downloader.cancel();
        converter.cancel();
        mainWindow = null;
      });
      await mainWindow.loadURL(developmentUrl || ORIGIN + '/library');
    })
    .catch((error) => {
      console.error(error);
      dialog.showErrorBox('Onlystory could not start', error.message);
      app.exit(1);
    });
  app.on('window-all-closed', () => app.quit());
}
