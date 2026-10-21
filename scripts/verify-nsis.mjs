// Exercise the real per-user NSIS installer in an isolated workspace directory.
// Never replace or uninstall a pre-existing Onlystory installation.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

if (process.platform !== 'win32')
  throw Error('NSIS verification needs Windows.');
const version = JSON.parse(
  fs.readFileSync('desktop/package.json', 'utf8'),
).version;
const option = process.argv.find((arg) => arg.startsWith('--installer='));
const installer = path.resolve(
  option?.slice('--installer='.length) ??
    `release/Onlystory-${version}-Setup-x64.exe`,
);
if (!fs.existsSync(installer)) throw Error(`Missing installer: ${installer}`);
const cacheRoot = path.resolve(
  process.env.ONLYSTORY_VERIFICATION_ROOT ?? '.cache',
);
const output = path.join(
  cacheRoot,
  'nsis-verification',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
const destination = path.join(output, 'installed');
if (!destination.startsWith(cacheRoot + path.sep))
  throw Error('Install target must be inside this workspace cache.');
fs.mkdirSync(output, { recursive: true });
const registry = () => {
  const script =
    "ConvertTo-Json -InputObject @(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^Onlystory(?:\\s|$)' } | Select-Object DisplayName,InstallLocation,UninstallString,PSChildName) -Compress";
  return JSON.parse(
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true },
    )
      .replace(/^\uFEFF/, '')
      .trim(),
  );
};
const existing = registry();
if (existing.length)
  throw Error(
    'An existing Onlystory installation is registered. Refusing to replace it during verification.',
  );

async function run(executable, args, env = process.env) {
  const child = spawn(executable, args, {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (data) => {
    log += data;
    process.stdout.write(data);
  });
  child.stderr.on('data', (data) => {
    log += data;
    process.stderr.write(data);
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0)
    throw Error(`${path.basename(executable)} exited with ${code}: ${log}`);
  return log;
}
async function waitFor(condition, message) {
  const deadline = Date.now() + 120000;
  while (!condition()) {
    if (Date.now() > deadline) throw Error(message);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
const executable = path.join(destination, 'Onlystory.exe');
const uninstaller = path.join(destination, 'Uninstall Onlystory.exe');
const result = {
  checkedAt: new Date().toISOString(),
  installer,
  installerBytes: fs.statSync(installer).size,
  installerSha256: createHash('sha256')
    .update(fs.readFileSync(installer))
    .digest('hex'),
  destination,
  existingInstallations: existing,
};
let installed = false;
try {
  await run(installer, ['/S', '/currentuser', '/D=' + destination]);
  await waitFor(
    () => fs.existsSync(executable) && fs.existsSync(uninstaller),
    'NSIS did not create the installed application and uninstaller.',
  );
  installed = true;
  const registered = registry();
  Object.assign(result, {
    installationPassed: true,
    registeredInstallation: registered,
  });
  if (
    !registered.some((entry) =>
      (entry.InstallLocation + ' ' + entry.UninstallString)
        .toLowerCase()
        .includes(destination.toLowerCase()),
    )
  )
    throw Error('NSIS did not register the owned test installation.');
  const groups = process.argv.filter((arg) => arg.startsWith('--groups='));
  const log = await run(
    process.execPath,
    ['scripts/verify-ba-downloads.mjs', ...groups],
    { ...process.env, ONLYSTORY_EXE: executable },
  );
  fs.writeFileSync(path.join(output, 'installed-verification.log'), log);
  const evidence =
    /PASS: native originals → BA import → cold offline reader\.\s+([^\r\n]+)/
      .exec(log)?.[1]
      ?.trim();
  if (!evidence)
    throw Error('Installed verifier did not report its evidence directory.');
  const report = JSON.parse(
    fs.readFileSync(path.join(evidence, 'results.json'), 'utf8'),
  );
  Object.assign(result, {
    installedAppPassed: true,
    evidence,
    chapters: report.chapters,
    packagedRuntime: report.packagedRuntime,
  });
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
} finally {
  if (installed || fs.existsSync(uninstaller)) {
    // NSIS's _?= argument is last and points only at the checked cache target.
    // It keeps uninstall execution inside that target instead of copying to temp.
    try {
      await run(uninstaller, ['/S', '_?=' + destination]);
      await waitFor(
        () =>
          !fs.existsSync(executable) &&
          !fs.existsSync(path.join(destination, 'resources/app.asar')),
        'NSIS uninstall left the installed executable behind.',
      );
      const remaining = registry();
      if (
        remaining.some((entry) =>
          (entry.InstallLocation + ' ' + entry.UninstallString)
            .toLowerCase()
            .includes(destination.toLowerCase()),
        )
      )
        throw Error('NSIS left the test installation registered.');
      Object.assign(result, {
        uninstallPassed: true,
        registeredAfterUninstall: remaining,
      });
    } catch (error) {
      result.uninstallFailure = error.stack;
      process.exitCode = 1;
    }
  }
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(
    process.exitCode
      ? 'FAIL: NSIS verification.'
      : 'PASS: NSIS install, packaged app import/offline reading, and uninstall.',
    output,
  );
}
