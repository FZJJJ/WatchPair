import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

describe('content script bundle', () => {
  it('can be injected as a classic content script', () => {
    execFileSync(npmCommand, ['run', 'build', '-w', '@watchpair/extension'], {
      cwd: projectRoot,
      shell: process.platform === 'win32',
      stdio: 'pipe',
    });

    const bundle = readFileSync(
      resolve(projectRoot, 'apps/extension/dist/content/content-script.js'),
      'utf8',
    );

    expect(bundle).not.toMatch(/^\s*import(?:\s|["'])/m);
  });
});
