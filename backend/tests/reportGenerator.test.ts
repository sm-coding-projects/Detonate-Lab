import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateReport } from '../src/services/reportGenerator.js';
import type { SampleInput } from '../src/types.js';
import type { FileCategory } from '../src/lib/filetype.js';
import { isBlockedIp } from '../src/lib/validate.js';

const sample: SampleInput = {
  name: 'testsample',
  sha256: 'a'.repeat(64),
  size: 0,
  fileType: 'unknown',
  source: 'seed',
};

function allIps(report: ReturnType<typeof generateReport>): string[] {
  const out = new Set<string>();
  for (const x of report.network.ips) out.add(x.ip);
  return [...out];
}

describe('reportGenerator — public-unicast IP whitelist', () => {
  // Run a number of archetypes across many seeds to catch any range slip.
  const cats: FileCategory[] = ['pe', 'dll', 'msi', 'office', 'script', 'pdf', 'unknown'];

  for (const cat of cats) {
    it(`emits only public-unicast IPs for category ${cat} (many seeds)`, () => {
      for (let s = 0; s < 32; s++) {
        const input: SampleInput = { ...sample, sha256: s.toString(16).padStart(64, '0') };
        const r = generateReport(input, cat);
        for (const ip of allIps(r)) {
          assert.ok(!isBlockedIp(ip), `mock report emitted a blocked IP: ${ip} (seed ${s}, cat ${cat})`);
          const oct = Number(ip.split('.')[0]);
          assert.ok(oct >= 1, `first octet must be ≥ 1 (got ${oct})`);
          const ok =
            (oct >= 1 && oct <= 9) ||
            (oct >= 11 && oct <= 76) ||
            (oct >= 77 && oct <= 99) ||
            (oct >= 101 && oct <= 126) ||
            (oct >= 128 && oct <= 171) ||
            (oct >= 173 && oct <= 191) ||
            (oct >= 193 && oct <= 197) ||
            (oct >= 199 && oct <= 202) ||
            (oct >= 204 && oct <= 223);
          assert.ok(ok, `first octet ${oct} not in the public-unicast whitelist (ip=${ip})`);
        }
      }
    });
  }
});
