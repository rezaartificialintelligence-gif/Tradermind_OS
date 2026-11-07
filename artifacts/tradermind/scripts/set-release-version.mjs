import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawVersion = process.env.RELEASE_VERSION?.trim() ?? '';

if (!rawVersion) {
  console.info('No version tag was supplied; retaining the package version.');
  process.exit(0);
}

const version = rawVersion.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Unsupported release version: ${rawVersion}`);
}

const packagePath = path.join(appRoot, 'package.json');
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
packageJson.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.info(`Set TraderMind package version to ${version}.`);
