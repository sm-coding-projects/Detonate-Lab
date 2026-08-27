import type { Report, SampleInput } from '../../types.js';
import { config } from '../../config.js';
import { generateReport } from '../reportGenerator.js';
import type { FileCategory } from '../../lib/filetype.js';
import { ANALYSIS_LINES, type ProgressFn, type SandboxConnector } from './types.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Default connector. Streams a realistic detonation log and produces a synthetic
 * report. It NEVER runs, opens, or interprets the submitted bytes — it only reads
 * the file-type label already computed at ingest and derives everything from the
 * sample's hash. This is the safe, self-contained analysis path.
 */
export class SimulatedConnector implements SandboxConnector {
  readonly name = 'simulated';

  async detonate(input: SampleInput, onProgress: ProgressFn, predetermined?: Report | null): Promise<Report> {
    const lines = ANALYSIS_LINES;
    for (let i = 0; i < lines.length; i++) {
      await sleep(config.simStepMs);
      await onProgress({
        progress: Math.min(100, Math.round(((i + 1) / lines.length) * 100)),
        line: { n: pad2(i + 1), txt: lines[i] },
      });
    }

    if (predetermined) return predetermined;

    // Derive the synthesis category from the file-type label fixed at ingest.
    return generateReport(input, guessCategoryFromLabel(input.fileType));
  }
}

function guessCategoryFromLabel(label: string): FileCategory {
  const l = label.toLowerCase();
  if (l.includes('dll') || l.includes('driver')) return 'dll';
  if (l.includes('msi') || l.includes('cabinet') || l.includes('ole')) return 'msi';
  if (l.includes('pe32') || l.includes('executable (gui)')) return 'pe';
  if (l.includes('elf')) return 'elf';
  if (l.includes('pdf')) return 'pdf';
  if (l.includes('office') || l.includes('ooxml')) return 'office';
  if (l.includes('android') || l.includes('apk') || l.includes('dex')) return 'apk';
  if (l.includes('script')) return 'script';
  if (l.includes('zip') || l.includes('rar') || l.includes('archive') || l.includes('jar')) return 'archive';
  return 'unknown';
}
