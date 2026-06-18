import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function localEnvFiles(root) {
  return [join(root, '.local', 'local.env')];
}

export function hasConfiguredValue(value) {
  const text = String(value || '').trim();
  return Boolean(text && !text.startsWith('your-') && text !== '...');
}

export function missingConfiguredEnv(keys, env = process.env) {
  return keys.filter((key) => !hasConfiguredValue(env[key]));
}

function parseValue(raw) {
  const value = raw.trim();
  if (value.length < 2) return value;

  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) return value;

  const inner = value.slice(1, -1);
  if (quote === "'") return inner;

  return inner
    .replaceAll('\\n', '\n')
    .replaceAll('\\r', '\r')
    .replaceAll('\\t', '\t')
    .replaceAll('\\"', '"')
    .replaceAll('\\\\', '\\');
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const assignment = trimmed.startsWith('export ') ? trimmed.slice(7).trimStart() : trimmed;
  const match = assignment.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return { warning: `Ignored invalid local env line: ${line}` };
  return { key: match[1], value: parseValue(match[2]) };
}

export function loadLocalEnv({ root, files = localEnvFiles(root), override = false } = {}) {
  if (!root) throw new Error('loadLocalEnv requires a root path.');

  const loadedFiles = [];
  const loadedKeys = [];
  const warnings = [];

  for (const file of files) {
    if (!existsSync(file)) continue;
    loadedFiles.push(file);

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      if (parsed.warning) {
        warnings.push(`${file}: ${parsed.warning}`);
        continue;
      }
      if (!override && process.env[parsed.key] !== undefined) continue;
      process.env[parsed.key] = parsed.value;
      loadedKeys.push(parsed.key);
    }
  }

  return { files: loadedFiles, keys: loadedKeys, warnings };
}
