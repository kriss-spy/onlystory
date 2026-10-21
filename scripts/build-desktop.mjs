import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const platform =
  process.argv.find((arg) => arg.startsWith('--platform='))?.split('=')[1] ??
  process.platform;
if (!['win32', 'linux'].includes(platform))
  throw Error('Supported desktop targets: win32, linux');
function npm(args) {
  // Fixed commands only; no user paths or source URLs enter the shell.
  if (process.platform === 'win32')
    execFileSync(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'npm ' + args.join(' ')],
      { cwd: root, stdio: 'inherit' },
    );
  else execFileSync('npm', args, { cwd: root, stdio: 'inherit' });
}
if (!process.argv.includes('--skip-build')) npm(['run', 'build']);
const target = path.resolve(root, 'desktop/web');
if (path.dirname(target) !== path.join(root, 'desktop'))
  throw Error('Unexpected desktop output directory');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(path.join(root, 'dist'), target, { recursive: true });
for (const filename of ['sources.json', 'native-transforms.json'])
  fs.copyFileSync(
    path.join(root, 'src/downloads/ba', filename),
    path.join(root, 'desktop', filename),
  );
const require = createRequire(import.meta.url);
const ffmpegRoot = path.dirname(require.resolve('ffmpeg-static'));
const executable = path.join(
  ffmpegRoot,
  platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
);
if (!fs.existsSync(executable))
  execFileSync(process.execPath, [path.join(ffmpegRoot, 'install.js')], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_platform: platform,
      npm_config_arch: 'x64',
    },
  });
const tools = path.join(root, 'desktop/tools');
fs.mkdirSync(tools, { recursive: true });
fs.copyFileSync(
  executable,
  path.join(tools, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
);
if (platform === 'linux') fs.chmodSync(path.join(tools, 'ffmpeg'), 0o755);
// Ship the binary's corresponding license and build/readme information.
for (const suffix of ['LICENSE', 'README']) {
  const source = executable + '.' + suffix;
  if (!fs.existsSync(source)) throw Error(`Missing ffmpeg ${suffix} notice`);
  fs.copyFileSync(source, path.join(tools, 'ffmpeg.' + suffix));
}
if (!process.argv.includes('--prepare-only')) {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'desktop/electron-builder.json'), 'utf8'),
  );
  config.files.push(
    platform === 'linux' ? '!tools/ffmpeg.exe*' : '!tools/ffmpeg',
  );
  if (platform === 'linux') {
    delete config.electronDist;
    config.linux = {
      target: [{ target: 'tar.gz', arch: ['x64'] }],
      category: 'Game',
      icon: 'public/icons/app-512.png',
      artifactName: 'Onlystory-${version}-linux-${arch}.${ext}',
    };
  }
  const configFile = path.join(
    root,
    '.cache',
    `electron-builder-${platform}.json`,
  );
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config));
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/electron-builder/out/cli/cli.js'),
      '--config',
      configFile,
      platform === 'linux' ? '--linux' : '--win',
      '--x64',
      '--publish',
      'never',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        ELECTRON_BUILDER_COMPRESSION_LEVEL:
          process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || '5',
      },
    },
  );
}
