import type { Report, SampleInput, KillChainStage, TimelineEvent, BlastLayer, Level, Provenance } from '../types.js';
import type { FileCategory } from '../lib/filetype.js';
import { rng, seedInt } from '../lib/hash.js';
import { scoreToSeverity } from '../lib/severity.js';
import { humanSize } from '../lib/filetype.js';

// ---------------------------------------------------------------------------
// Deterministic, fully-synthetic report synthesis. No submitted bytes are ever
// executed: the report is derived only from the sample's hash + metadata. The
// same input always yields the same report.
// ---------------------------------------------------------------------------

const ADJ = ['WRAITH', 'GHOST', 'NIGHT', 'IRON', 'BLACK', 'PALE', 'HOLLOW', 'GRIM', 'ASH', 'COLD', 'SILENT', 'RUST', 'VEX', 'DUSK', 'CRIMSON'];
const NOUN = ['LOCK', 'FEED', 'HOLLOW', 'JACKAL', 'SPIRE', 'VEIL', 'FANG', 'HUSK', 'WARDEN', 'CIPHER', 'TIDE', 'MAW', 'RAVEN', 'SNARE', 'EMBER'];

function codename(seed: string): string {
  const a = ADJ[seedInt(seed, 'a') % ADJ.length];
  const b = NOUN[seedInt(seed, 'b') % NOUN.length];
  return (a + b).toUpperCase();
}

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}
function between(r: () => number, lo: number, hi: number): number {
  return Math.floor(lo + r() * (hi - lo + 1));
}

type Archetype = 'ransomware' | 'stealer' | 'rat' | 'dropper' | 'clean';

function chooseArchetype(cat: FileCategory, score: number, r: () => number): Archetype {
  if (score < 25) return 'clean';
  if (cat === 'pe' || cat === 'msi' || cat === 'dll') {
    return pick(r, ['ransomware', 'stealer', 'rat'] as Archetype[]);
  }
  if (cat === 'script' || cat === 'office' || cat === 'pdf') {
    return pick(r, ['dropper', 'stealer'] as Archetype[]);
  }
  if (cat === 'apk') return pick(r, ['stealer', 'rat'] as Archetype[]);
  if (cat === 'elf') return pick(r, ['rat', 'dropper'] as Archetype[]);
  return pick(r, ['dropper', 'clean'] as Archetype[]);
}

function baseScore(cat: FileCategory, r: () => number): number {
  const band: Record<FileCategory, [number, number]> = {
    pe: [72, 96], dll: [66, 92], msi: [60, 90], office: [48, 84], script: [44, 86],
    pdf: [38, 74], apk: [52, 82], elf: [50, 80], archive: [22, 58], unknown: [10, 46],
  };
  const [lo, hi] = band[cat] ?? [20, 60];
  return between(r, lo, hi);
}

const GEOS = ['NL', 'RU', 'RO', 'BG', 'SC', 'PA', 'CN', 'IR', 'KP', 'US', 'DE', 'UA'];
function randIp(r: () => number): string {
  return [between(r, 23, 213), between(r, 1, 254), between(r, 1, 254), between(r, 1, 254)].join('.');
}
function hex(r: () => number, n: number): string {
  let s = '';
  const c = '0123456789abcdef';
  for (let i = 0; i < n; i++) s += c[Math.floor(r() * 16)];
  return s;
}
const C2_WORDS = ['cdn', 'telemetry', 'sync', 'api', 'update', 'metrics', 'edge', 'static', 'cloud', 'analytics', 'assets', 'mail'];
function c2Domain(r: () => number): string {
  const a = pick(r, C2_WORDS);
  let b = pick(r, C2_WORDS);
  if (b === a) b = pick(r, C2_WORDS);
  const tld = pick(r, ['net', 'io', 'com', 'cc', 'xyz', 'org']);
  return `${a}-${b}[.]${tld}`;
}

// --- MITRE building blocks ---------------------------------------------------

type StageTpl = Omit<KillChainStage, 'level'> & { level?: Level };

const T = {
  initialPhish: (): StageTpl => ({
    tactic: 'Initial Access', id: 'TA0001', short: 'Access',
    plain: 'The sample arrived via a phishing message and was opened by the user — its entry point onto the machine.',
    techniques: [{ id: 'T1566.001', name: 'Spearphishing Attachment', desc: 'Delivered as a disguised attachment in a targeted email.' }],
  }),
  exec: (): StageTpl => ({
    tactic: 'Execution', id: 'TA0002', short: 'Exec',
    plain: 'Once opened, the file ran and launched additional hidden processes to carry out the attack.',
    techniques: [
      { id: 'T1204.002', name: 'User Execution: Malicious File', desc: 'User launched the sample, starting the payload.' },
      { id: 'T1059.001', name: 'PowerShell', desc: 'Spawned powershell.exe -w hidden with an encoded command block.' },
    ],
  }),
  persist: (): StageTpl => ({
    tactic: 'Persistence', id: 'TA0003', short: 'Persist',
    plain: 'The malware set itself to relaunch automatically so it survives reboots.',
    techniques: [
      { id: 'T1547.001', name: 'Registry Run Key', desc: 'Wrote an autostart Run key pointing to the payload.' },
      { id: 'T1053.005', name: 'Scheduled Task', desc: 'Created a scheduled task triggered on logon.' },
    ],
  }),
  privesc: (): StageTpl => ({
    tactic: 'Privilege Escalation', id: 'TA0004', short: 'PrivEsc',
    plain: 'It elevated to administrator without prompting the user, gaining full control of the system.',
    techniques: [{ id: 'T1548.002', name: 'Bypass UAC', desc: 'Abused an auto-elevating Windows binary to run as administrator.' }],
  }),
  evade: (): StageTpl => ({
    tactic: 'Defense Evasion', id: 'TA0005', short: 'Evade',
    plain: 'The malware disabled defenses and hid its activity to avoid detection.',
    techniques: [
      { id: 'T1562.001', name: 'Disable Security Tools', desc: 'Disabled real-time antivirus protection.' },
      { id: 'T1027', name: 'Obfuscated Files', desc: 'Payload packed and string-encrypted.' },
    ],
  }),
  cred: (): StageTpl => ({
    tactic: 'Credential Access', id: 'TA0006', short: 'Cred',
    plain: 'It harvested stored passwords and secrets from the machine.',
    techniques: [{ id: 'T1003.001', name: 'LSASS Memory', desc: 'Dumped LSASS to harvest credentials.' }],
  }),
  browserCred: (): StageTpl => ({
    tactic: 'Credential Access', id: 'TA0006', short: 'Cred',
    plain: 'It stole saved browser passwords, cookies, and wallet files.',
    techniques: [
      { id: 'T1555.003', name: 'Credentials from Browsers', desc: 'Copied saved Chrome/Edge login data.' },
      { id: 'T1539', name: 'Steal Web Session Cookie', desc: 'Harvested session cookies to bypass MFA.' },
    ],
  }),
  discovery: (): StageTpl => ({
    tactic: 'Discovery', id: 'TA0007', short: 'Disc',
    plain: 'It mapped the machine and surrounding network to choose targets.',
    techniques: [
      { id: 'T1083', name: 'File and Directory Discovery', desc: 'Enumerated documents and shares.' },
      { id: 'T1018', name: 'Remote System Discovery', desc: 'Scanned neighbouring hosts over SMB/LDAP.' },
    ],
  }),
  lateral: (): StageTpl => ({
    tactic: 'Lateral Movement', id: 'TA0008', short: 'Lateral',
    plain: 'Using stolen credentials, it copied itself to another machine on the network.',
    techniques: [{ id: 'T1021.002', name: 'SMB / Admin Shares', desc: 'Authenticated to a remote host using a stolen hash.' }],
  }),
  collect: (): StageTpl => ({
    tactic: 'Collection', id: 'TA0009', short: 'Collect',
    plain: 'It gathered sensitive files and recorded activity to send to the attacker.',
    techniques: [
      { id: 'T1005', name: 'Data from Local System', desc: 'Staged documents for exfiltration.' },
      { id: 'T1056.001', name: 'Keylogging', desc: 'Captured keystrokes and clipboard.' },
    ],
  }),
  c2: (): StageTpl => ({
    tactic: 'Command and Control', id: 'TA0011', short: 'C2',
    plain: 'The malware phoned home to an attacker-controlled server over encrypted HTTPS.',
    techniques: [
      { id: 'T1071.001', name: 'Web Protocols', desc: 'HTTPS beacon to the C2 endpoint.' },
      { id: 'T1573.002', name: 'Asymmetric Cryptography', desc: 'TLS channel hides command traffic.' },
    ],
  }),
  remoteAccess: (): StageTpl => ({
    tactic: 'Command and Control', id: 'TA0011', short: 'C2',
    plain: 'It opened a remote channel letting the operator control the machine at will.',
    techniques: [
      { id: 'T1071.001', name: 'Web Protocols', desc: 'HTTPS beacon to the operator.' },
      { id: 'T1219', name: 'Remote Access Software', desc: 'Interactive remote shell opened.' },
    ],
  }),
  exfil: (): StageTpl => ({
    tactic: 'Exfiltration', id: 'TA0010', short: 'Exfil',
    plain: 'It uploaded collected company data to the attacker.',
    techniques: [{ id: 'T1041', name: 'Exfiltration Over C2 Channel', desc: 'Uploaded staged data to the C2 server.' }],
  }),
  impact: (): StageTpl => ({
    tactic: 'Impact', id: 'TA0040', short: 'Impact',
    plain: 'Finally it deleted backups and encrypted files, then dropped a ransom note.',
    techniques: [
      { id: 'T1486', name: 'Data Encrypted for Impact', desc: 'Encrypted user files and appended a new extension.' },
      { id: 'T1490', name: 'Inhibit System Recovery', desc: 'Deleted Volume Shadow Copies.' },
      { id: 'T1489', name: 'Service Stop', desc: 'Stopped backup and database services before encryption.' },
    ],
  }),
  download: (): StageTpl => ({
    tactic: 'Execution', id: 'TA0002', short: 'Exec',
    plain: 'The document/script reached out and downloaded a second-stage payload.',
    techniques: [
      { id: 'T1059.005', name: 'Visual Basic', desc: 'Macro/script executed an obfuscated downloader.' },
      { id: 'T1105', name: 'Ingress Tool Transfer', desc: 'Fetched a follow-on payload over HTTP.' },
    ],
  }),
};

const LEVEL_BY_TACTIC: Partial<Record<string, Level>> = {
  TA0001: 'high', TA0002: 'high', TA0003: 'medium', TA0004: 'high', TA0005: 'high',
  TA0006: 'critical', TA0007: 'low', TA0008: 'high', TA0009: 'medium', TA0011: 'high',
  TA0010: 'critical', TA0040: 'critical',
};

const ARCHETYPE_CHAIN: Record<Archetype, (() => StageTpl)[]> = {
  ransomware: [T.initialPhish, T.exec, T.persist, T.privesc, T.evade, T.cred, T.discovery, T.lateral, T.collect, T.c2, T.exfil, T.impact],
  stealer: [T.initialPhish, T.exec, T.persist, T.evade, T.browserCred, T.collect, T.c2, T.exfil],
  rat: [T.initialPhish, T.exec, T.persist, T.evade, T.cred, T.discovery, T.remoteAccess, T.collect],
  dropper: [T.initialPhish, T.download, T.persist, T.evade, T.c2],
  clean: [T.initialPhish, T.exec],
};

const CLASS_BY_ARCHETYPE: Record<Archetype, string> = {
  ransomware: 'Ransomware (double extortion)',
  stealer: 'Infostealer / credential theft',
  rat: 'Remote Access Trojan',
  dropper: 'Trojan downloader / dropper',
  clean: 'No malicious behavior observed',
};

const TAGLINE_BY_ARCHETYPE: Record<Archetype, string> = {
  ransomware: 'Encrypts files, deletes backups, and exfiltrates data for double extortion. Spreads across the network.',
  stealer: 'Steals browser passwords, cookies, and wallets, then exfiltrates them to attacker infrastructure.',
  rat: 'Opens a persistent remote-access channel and lets the operator control the host on demand.',
  dropper: 'Acts as a delivery vehicle — downloads and runs a second-stage payload while staying quiet.',
  clean: 'No malicious behavior was observed during detonation. Treat as low risk pending review.',
};

/**
 * Provenance stamp for a fully synthesized report. `generateReport` fabricates
 * every field from the sample's SHA-256 — it is a plausible-looking demo report,
 * not an analysis result, and it says so.
 */
export const SYNTHETIC_PROVENANCE: Provenance = {
  engine: 'simulated',
  label: 'Simulated detonation',
  synthetic: true,
  caveat:
    'Nothing was executed or inspected. Every finding below is synthesized from the sample hash for demonstration and must not be read as analysis.',
  unsupported: [],
};

export function generateReport(input: SampleInput, category: FileCategory): Report {
  const seed = input.sha256;
  const r = rng(seed);

  let score = baseScore(category, r);
  const archetype = chooseArchetype(category, score, r);
  if (archetype === 'clean') score = Math.min(score, between(r, 6, 22));
  const sev = scoreToSeverity(score);
  const name = codename(seed);

  const stages: KillChainStage[] = ARCHETYPE_CHAIN[archetype].map((mk) => {
    const t = mk();
    return { ...t, level: t.level ?? LEVEL_BY_TACTIC[t.id] ?? 'medium' };
  });

  const timeline = buildTimeline(stages, r);
  const network = buildNetwork(archetype, r);
  const blast = buildBlast(archetype, score, r);
  const tiles = buildTiles(archetype, r);
  const factors = buildFactors(archetype);

  return {
    id: '', // filled by caller (== sampleId)
    // Everything below is synthesized from the hash — no part of it was observed.
    // A connector that does real work is expected to replace this stamp (and the
    // fields it can actually substantiate). See connectors/static.ts.
    provenance: SYNTHETIC_PROVENANCE,
    name,
    file: input.name,
    sha: input.sha256,
    type: input.fileType + (input.size ? ` · ${humanSize(input.size)}` : ''),
    size: input.size ? humanSize(input.size) : '—',
    seen: nowLabel(),
    classification: CLASS_BY_ARCHETYPE[archetype],
    verdict: sev.verdict,
    confidence: sev.confidence,
    severity: score,
    sevLevel: sev.level,
    sevLabel: sev.label,
    tagline: TAGLINE_BY_ARCHETYPE[archetype],
    summary: buildSummary(name, archetype, input, tiles),
    tiles,
    factors,
    killchain: stages,
    timeline,
    blast,
    network,
  };
}

function nowLabel(): string {
  // Display label only; uses the server clock at synthesis time.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function buildTimeline(stages: KillChainStage[], r: () => number): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let t = 0;
  for (const k of stages) {
    // One or two events per stage, drawn from its techniques.
    const n = Math.min(k.techniques.length, k.techniques.length > 1 && r() > 0.4 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      t += +(0.4 + r() * 2.6).toFixed(1);
      const tech = k.techniques[i];
      events.push({ t: +t.toFixed(1), label: k.tactic, detail: `${tech.name} — ${tech.desc}`, level: k.level });
    }
  }
  return events;
}

function buildNetwork(archetype: Archetype, r: () => number) {
  const ipCount = archetype === 'ransomware' ? 3 : archetype === 'clean' ? 1 : 2;
  const ips = Array.from({ length: ipCount }, (_, i) => ({
    ip: randIp(r),
    role: i === 0 ? 'C2' : i === 1 ? (archetype === 'ransomware' ? 'C2 fallback' : 'Payload / Exfil') : 'Payload host',
    geo: pick(r, GEOS),
  }));
  const proto = pick(r, ['HTTPS / TLS 1.3', 'HTTPS / TLS 1.2']);
  const beaconBase = pick(r, [30, 45, 60, 90]);
  const exfil = archetype === 'ransomware' ? `${(1 + r() * 3).toFixed(2)} GB`
    : archetype === 'clean' ? '0 B'
    : `${between(r, 8, 120)} MB`;
  return {
    victim: `WKSTN-${between(r, 1000, 9999)}`,
    domain: c2Domain(r),
    proto,
    beacon: `${beaconBase}s ± ${between(r, 10, 40)}%`,
    exfil,
    ja3: hex(r, 32),
    ips,
    log: [
      { t: '00:07.4', e: `TLS handshake to ${ips[0].ip}:443` },
      { t: '00:07.9', e: 'Beacon check-in (host fingerprint)' },
      { t: '00:12.2', e: `POST /sync — ${exfil} exfil begins` },
      { t: '01:07.8', e: 'Beacon check-in' },
      { t: '02:07.5', e: archetype === 'rat' ? 'Operator opened remote shell' : 'Beacon check-in' },
    ],
  };
}

function buildBlast(archetype: Archetype, score: number, r: () => number): BlastLayer[] {
  const lat = archetype === 'ransomware';
  const lv = (n: number): Level => (n >= 85 ? 'critical' : n >= 65 ? 'high' : n >= 40 ? 'medium' : 'low');
  const dept = pick(r, ['Finance', 'Engineering', 'Sales', 'HR', 'Operations', 'Legal']);
  const files = between(r, 1800, 24000);
  const exfilGb = `${(0.2 + r() * 3).toFixed(2)} GB`;
  return [
    { key: 'origin', label: `WKSTN-${between(r, 1000, 9999)}`, sub: `Patient zero · ${dept}`, level: lv(score), stats: [{ n: 1, t: 'host infected' }] },
    { key: 'process', label: 'Process', sub: 'In-memory execution', level: 'high', stats: [{ n: between(r, 3, 9), t: 'malicious processes' }, { n: 1, t: 'injected (explorer)' }] },
    {
      key: 'host', label: 'Host', sub: 'Local machine impact', level: lv(score),
      stats: archetype === 'ransomware'
        ? [{ n: files, t: 'files encrypted' }, { n: between(r, 1, 4), t: 'services stopped' }, { n: 1, t: 'backups wiped' }]
        : [{ n: between(r, 40, 320), t: 'credentials read' }, { n: between(r, 1, 6), t: 'wallets harvested' }],
    },
    { key: 'network', label: 'Local Network', sub: lat ? 'Lateral spread' : 'No lateral spread', level: lat ? 'high' : 'low', stats: lat ? [{ n: between(r, 12, 60), t: 'hosts scanned' }, { n: between(r, 1, 3), t: 'servers compromised' }] : [{ n: 0, t: 'hosts compromised' }, { n: 1, t: 'host beaconing' }] },
    { key: 'identity', label: 'Identity & Data', sub: 'Org-wide exposure', level: 'critical', stats: [{ n: between(r, 1, 24), t: 'session cookies stolen' }, { n: exfilGb, t: 'data exfiltrated' }] },
    { key: 'c2', label: 'Internet / C2', sub: 'Adversary infrastructure', level: 'high', stats: [{ n: between(r, 1, 3), t: 'C2 IP addresses' }, { n: 1, t: 'C2 domain' }] },
  ];
}

function buildTiles(archetype: Archetype, r: () => number): { l: string; v: string; hot: boolean }[] {
  if (archetype === 'ransomware') {
    return [
      { l: 'Files encrypted', v: between(r, 1800, 24000).toLocaleString('en-US'), hot: true },
      { l: 'Data exfiltrated', v: `${(0.5 + r() * 3).toFixed(2)} GB`, hot: true },
      { l: 'Hosts compromised', v: String(between(r, 1, 4)), hot: true },
    ];
  }
  if (archetype === 'clean') {
    return [
      { l: 'Files encrypted', v: '0', hot: true },
      { l: 'Data exfiltrated', v: '0 B', hot: true },
      { l: 'Hosts compromised', v: '0', hot: true },
    ];
  }
  return [
    { l: 'Credentials stolen', v: String(between(r, 40, 320)), hot: true },
    { l: 'Crypto wallets', v: String(between(r, 0, 6)), hot: true },
    { l: 'Data exfiltrated', v: `${between(r, 8, 120)} MB`, hot: true },
  ];
}

function buildFactors(archetype: Archetype): { label: string; on: boolean; level: Level }[] {
  const on = (a: Archetype[]): boolean => a.includes(archetype);
  return [
    { label: 'Destructive — encrypts data', on: on(['ransomware']), level: 'critical' },
    { label: 'Inhibits system recovery', on: on(['ransomware']), level: 'critical' },
    { label: 'Exfiltrates data', on: on(['ransomware', 'stealer', 'rat']), level: 'critical' },
    { label: 'Persistent remote access', on: on(['rat']), level: 'high' },
    { label: 'Spreads laterally', on: on(['ransomware']), level: 'high' },
    { label: 'Steals credentials', on: on(['ransomware', 'stealer', 'rat']), level: 'high' },
    { label: 'Disables security defenses', on: on(['ransomware', 'stealer', 'rat', 'dropper']), level: 'high' },
  ];
}

function buildSummary(name: string, archetype: Archetype, input: SampleInput, tiles: { l: string; v: string }[]): string {
  const t = (l: string) => tiles.find((x) => x.l === l)?.v ?? '0';
  switch (archetype) {
    case 'ransomware':
      return `${name} is a double-extortion ransomware delivered as ${input.name}. After execution it gains admin rights, disables defenses, and steals credentials. It exfiltrates ${t('Data exfiltrated')} of data, deletes local backups, and encrypts ${t('Files encrypted')} files before demanding payment. It also spreads laterally across the network.`;
    case 'stealer':
      return `${name} masquerades as a legitimate file (${input.name}). On launch it harvests saved browser passwords, cookies, and wallet files (${t('Credentials stolen')} credentials, ${t('Crypto wallets')} wallets) and exfiltrates ${t('Data exfiltrated')} to attacker infrastructure. It is stealthy and built for credential theft rather than immediate damage.`;
    case 'rat':
      return `${name} establishes a persistent remote-access trojan from ${input.name}. It steals credentials, surveys the host and network, and opens an interactive channel that lets the operator control the machine on demand — built for long-term espionage.`;
    case 'dropper':
      return `${name} is a downloader delivered as ${input.name}. It reaches out to attacker infrastructure to pull and run a second-stage payload, establishes persistence, and beacons to command-and-control while keeping a low profile.`;
    default:
      return `${name} (${input.name}) exhibited no clearly malicious behavior during detonation. Static and behavioral signals were low. Treat as low risk pending analyst review.`;
  }
}
