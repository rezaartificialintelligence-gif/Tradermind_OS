import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const appRoot = process.cwd();
const androidRoot = path.join(appRoot, 'android');
const javaRoot = path.join(androidRoot, 'app', 'src', 'main', 'java');
const manifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
const gradlePath = path.join(androidRoot, 'app', 'build.gradle');
const packageJson = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));

async function findMainActivity(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findMainActivity(fullPath);
      if (found) return found;
    } else if (entry.isFile() && entry.name === 'MainActivity.java') {
      return fullPath;
    }
  }
  return null;
}

async function patchMainActivity() {
  const mainActivity = await findMainActivity(javaRoot);
  if (!mainActivity) throw new Error('Could not find generated Capacitor MainActivity.java.');

  let source = await readFile(mainActivity, 'utf8');
  const resizeCall = 'getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);';
  if (source.includes(resizeCall)) return;

  if (!source.includes('import android.view.WindowManager;')) {
    source = source.replace(/^(package\s+[^;]+;\s*)/m, '$1\nimport android.view.WindowManager;\n');
  }

  const superOnCreate = /super\.onCreate\(savedInstanceState\);/;
  if (superOnCreate.test(source)) {
    // Case 1: onCreate already exists, add the resize call after super.onCreate
    source = source.replace(superOnCreate, match => `${match}\n        ${resizeCall}`);
  } else {
    // Case 2: onCreate does not exist, create it before the final closing brace
    if (!source.includes('import android.os.Bundle;')) {
      source = source.replace(/^(package\s+[^;]+;\s*)/m, '$1\nimport android.os.Bundle;\n');
    }
    const method = [
      '',
      '    @Override',
      '    public void onCreate(Bundle savedInstanceState) {',
      '        super.onCreate(savedInstanceState);',
      `        ${resizeCall}`,
      '    }',
      '',
    ].join('\n');
    const lastBrace = source.lastIndexOf('}');
    if (lastBrace === -1) throw new Error('Could not find the end of the MainActivity class.');
    source = source.slice(0, lastBrace) + method + source.slice(lastBrace);
  }

  await writeFile(mainActivity, source, 'utf8');
}

async function patchManifest() {
  let manifest = await readFile(manifestPath, 'utf8');
  const activityTags = [...manifest.matchAll(/<activity\b[^>]*>/g)];
  const mainActivityTag = activityTags.find(match => /android:name\s*=\s*["'][^"']*MainActivity["']/.test(match[0]));
  if (!mainActivityTag) throw new Error('Could not locate the generated MainActivity entry in AndroidManifest.xml.');

  const tag = mainActivityTag[0];
  const patchedTag = /android:windowSoftInputMode\s*=/.test(tag)
    ? tag.replace(/android:windowSoftInputMode\s*=\s*["'][^"']*["']/, 'android:windowSoftInputMode="adjustResize"')
    : tag.replace(/\s*\/?>$/, ending => ` android:windowSoftInputMode="adjustResize"${ending}`);
  manifest = manifest.replace(tag, patchedTag);
  await writeFile(manifestPath, manifest, 'utf8');
}

async function patchAppVersion() {
  const version = packageJson.version;
  const match = typeof version === 'string'
    ? version.match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/)
    : null;
  if (!match) throw new Error(`Unsupported Android app version: ${version}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  const versionCode = Math.max(1, major * 1_000_000 + minor * 1_000 + patch + 1);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) {
    throw new Error(`Android versionCode is outside the supported range for ${version}.`);
  }

  let gradle = await readFile(gradlePath, 'utf8');
  const [withCode, codeCount] = replaceFirst(
    gradle,
    /^(\s*versionCode\s+)\d+\s*$/m,
    `$1${versionCode}`,
  );
  const [withName, nameCount] = replaceFirst(
    withCode,
    /^(\s*versionName\s+")[^"]+("\s*)$/m,
    `$1${version}$2`,
  );
  if (codeCount !== 1 || nameCount !== 1) throw new Error('Could not update Android versionCode/versionName.');
  await writeFile(gradlePath, withName, 'utf8');
}

function replaceFirst(source, pattern, replacement) {
  const match = source.match(pattern);
  if (!match) return [source, 0];
  return [source.replace(pattern, replacement), 1];
}

if (!existsSync(javaRoot) || !existsSync(manifestPath) || !existsSync(gradlePath)) {
  throw new Error('Capacitor Android project has not been generated; run cap sync android first.');
}

await patchMainActivity();
await patchManifest();
await patchAppVersion();
console.info(`Applied Android keyboard resize and version patches for ${packageJson.version}.`);
