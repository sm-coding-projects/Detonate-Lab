import { readFile } from 'node:fs/promises';
import type { Report, SampleInput, Level, KillChainStage, Provenance } from '../../types.js';
import { config } from '../../config.js';
import { generateReport } from '../reportGenerator.js';
import { scoreToSeverity } from '../../lib/severity.js';
import { logger } from '../../lib/log.js';
import type { FileCategory } from '../../lib/filetype.js';
import type { ProgressFn, SandboxConnector } from './types.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pad2 = (n: number) => String(n).padStart(2, '0');

interface StaticRule {
  id: string;
  name: string;
  tactic: string;
  techniqueId: string;
  techniqueName: string;
  desc: string;
  regex: RegExp;
  score: number;
  level: Level;
  timelineLabel: string;
  timelineDetail: string;
}

const RULES: StaticRule[] = [
  {
    id: 'powershell',
    name: 'PowerShell execution',
    tactic: 'Execution',
    techniqueId: 'T1059.001',
    techniqueName: 'PowerShell',
    desc: 'Spawns powershell.exe with potentially hidden or encoded command flags.',
    regex: /powershell(\.exe)?\s+(-w\s+hidden|-windowstyle\s+hidden|-enc|-encodedcommand|-nop)/i,
    score: 15,
    level: 'high',
    timelineLabel: 'Execution',
    timelineDetail: 'Suspicious PowerShell execution string detected (hidden/encoded flags).'
  },
  {
    id: 'cmd',
    name: 'Command execution',
    tactic: 'Execution',
    techniqueId: 'T1059.003',
    techniqueName: 'Windows Command Shell',
    desc: 'Spawns cmd.exe to run commands silently.',
    regex: /cmd\.exe\s+(\/c|\/k)/i,
    score: 8,
    level: 'medium',
    timelineLabel: 'Execution',
    timelineDetail: 'Silent Windows Command Shell invocation detected.'
  },
  {
    id: 'wscript',
    name: 'Windows Script Host',
    tactic: 'Execution',
    techniqueId: 'T1059.005',
    techniqueName: 'Visual Basic',
    desc: 'Uses WScript/ActiveX scripting hosts to download or run binaries.',
    regex: /(WScript\.Shell|ActiveXObject|CreateObject\("Shell\.Application"\))/i,
    score: 10,
    level: 'high',
    timelineLabel: 'Execution',
    timelineDetail: 'ActiveX / WScript Shell object reference found.'
  },
  {
    id: 'certutil',
    name: 'Ingress Tool Transfer via Certutil',
    tactic: 'Execution',
    techniqueId: 'T1105',
    techniqueName: 'Ingress Tool Transfer',
    desc: 'Uses certutil.exe to download files from remote locations.',
    regex: /certutil(\.exe)?\s+(-urlcache\s+-f\s+http|-ping)/i,
    score: 18,
    level: 'high',
    timelineLabel: 'Execution',
    timelineDetail: 'Certutil binary usage configured for file retrieval.'
  },
  {
    id: 'registry_run',
    name: 'Registry Autostart',
    tactic: 'Persistence',
    techniqueId: 'T1547.001',
    techniqueName: 'Registry Run Key',
    desc: 'Wrote an autostart registry Run or RunOnce key.',
    regex: /Software\\Microsoft\\Windows\\CurrentVersion\\(Run|RunOnce)/i,
    score: 12,
    level: 'medium',
    timelineLabel: 'Persistence',
    timelineDetail: 'Registry Run/RunOnce autostart key reference found.'
  },
  {
    id: 'scheduled_task',
    name: 'Scheduled Task autostart',
    tactic: 'Persistence',
    techniqueId: 'T1053.005',
    techniqueName: 'Scheduled Task',
    desc: 'Creates a scheduled task or service to survive reboots.',
    regex: /(schtasks(\.exe)?\s+\/create|\bscreate\b|RegisterTaskDefinition)/i,
    score: 12,
    level: 'medium',
    timelineLabel: 'Persistence',
    timelineDetail: 'Scheduled Task creation string found.'
  },
  {
    id: 'uac_bypass',
    name: 'UAC Bypass signature',
    tactic: 'Privilege Escalation',
    techniqueId: 'T1548.002',
    techniqueName: 'Bypass UAC',
    desc: 'Attempts UAC bypass via auto-elevating binaries or registry hijacking.',
    regex: /(fodhelper\.exe|eventvwr\.exe|sdclt\.exe)/i,
    score: 20,
    level: 'high',
    timelineLabel: 'Privilege Escalation',
    timelineDetail: 'Auto-elevating system binary reference (UAC bypass candidate) detected.'
  },
  {
    id: 'disable_av',
    name: 'Antivirus evasion',
    tactic: 'Defense Evasion',
    techniqueId: 'T1562.001',
    techniqueName: 'Disable Security Tools',
    desc: 'Disables active antivirus/Windows Defender protection.',
    regex: /(Set-MpPreference\s+-DisableRealtimeMonitoring\s+\$true|DisableRealtimeMonitoring|DisableBehaviorMonitoring)/i,
    score: 22,
    level: 'high',
    timelineLabel: 'Defense Evasion',
    timelineDetail: 'Antivirus realtime protection disable script/instruction detected.'
  },
  {
    id: 'clear_logs',
    name: 'Event log wiping',
    tactic: 'Defense Evasion',
    techniqueId: 'T1070.001',
    techniqueName: 'Clear Windows Event Logs',
    desc: 'Clears system or security event logs to hide activity.',
    regex: /(wevtutil(\.exe)?\s+cl\s+|Clear-EventLog)/i,
    score: 15,
    level: 'high',
    timelineLabel: 'Defense Evasion',
    timelineDetail: 'Event log purging instructions detected.'
  },
  {
    id: 'process_injection',
    name: 'Process Injection imports',
    tactic: 'Defense Evasion',
    techniqueId: 'T1027',
    techniqueName: 'Obfuscated Files',
    desc: 'Uses Windows APIs commonly tied to shellcode execution or process injection.',
    regex: /(VirtualAllocEx|WriteProcessMemory|CreateRemoteThread|QueueUserAPC|RtlCreateUserThread)/i,
    score: 18,
    level: 'high',
    timelineLabel: 'Defense Evasion',
    timelineDetail: 'In-memory process manipulation APIs detected.'
  },
  {
    id: 'cred_dumping',
    name: 'Credential Dumping indicators',
    tactic: 'Credential Access',
    techniqueId: 'T1003.001',
    techniqueName: 'LSASS Memory',
    desc: 'References LSASS memory dumping or credentials extraction tools.',
    regex: /(lsass\.exe|comsvcs\.dll\s+MiniDump|sekurlsa|mimikatz)/i,
    score: 25,
    level: 'critical',
    timelineLabel: 'Credential Access',
    timelineDetail: 'LSASS credentials dumping string found.'
  },
  {
    id: 'browser_theft',
    name: 'Browser credential theft',
    tactic: 'Credential Access',
    techniqueId: 'T1555.003',
    techniqueName: 'Credentials from Browsers',
    desc: 'Searches for or accesses local web browser login databases and cookies.',
    regex: /(Login\s+Data|Web\s+Data|Cookies|Local\s+State|Chrome\\User\s+Data)/i,
    score: 12,
    level: 'high',
    timelineLabel: 'Credential Access',
    timelineDetail: 'Web browser login database file target detected.'
  },
  {
    id: 'crypto_wallet',
    name: 'Cryptocurrency Wallet theft',
    tactic: 'Credential Access',
    techniqueId: 'T1555',
    techniqueName: 'Credentials from Web Browsers',
    desc: 'Locates or extracts local cryptocurrency wallet data.',
    regex: /(wallet\.dat|MetaMask|Exodus|electrum|TrustWallet)/i,
    score: 15,
    level: 'high',
    timelineLabel: 'Credential Access',
    timelineDetail: 'Cryptocurrency wallet files/extensions referenced.'
  },
  {
    id: 'net_discovery',
    name: 'Network asset discovery',
    tactic: 'Discovery',
    techniqueId: 'T1018',
    techniqueName: 'Remote System Discovery',
    desc: 'Queries network config or scans local subnets.',
    regex: /(net\s+view|arp\s+-a|netstat\s+-a|nbtstat)/i,
    score: 5,
    level: 'low',
    timelineLabel: 'Discovery',
    timelineDetail: 'Network mapping / active connection scanning calls found.'
  },
  {
    id: 'lateral_smb',
    name: 'Lateral Movement SMB shares',
    tactic: 'Lateral Movement',
    techniqueId: 'T1021.002',
    techniqueName: 'SMB / Admin Shares',
    desc: 'Attempts movement or execution on administrative network shares.',
    regex: /(\\[a-zA-Z0-9._-]+\\(C\$|ADMIN\$|IPC\$)|net\s+use\s+\\\\)/i,
    score: 15,
    level: 'high',
    timelineLabel: 'Lateral Movement',
    timelineDetail: 'Administrative SMB share target strings found.'
  },
  {
    id: 'keylogger',
    name: 'Keylogger mechanisms',
    tactic: 'Collection',
    techniqueId: 'T1056.001',
    techniqueName: 'Keylogging',
    desc: 'Sets hook APIs or keystroke monitoring loops.',
    regex: /(SetWindowsHookEx|GetAsyncKeyState|GetKeyboardState)/i,
    score: 12,
    level: 'medium',
    timelineLabel: 'Collection',
    timelineDetail: 'Keystroke hooking APIs detected.'
  },
  {
    id: 'vss_delete',
    name: 'Inhibit System Recovery',
    tactic: 'Impact',
    techniqueId: 'T1490',
    techniqueName: 'Inhibit System Recovery',
    desc: 'Deletes Volume Shadow Copies to block restore options.',
    regex: /(vssadmin(\.exe)?\s+delete\s+shadows|shadowstorage|bcdedit\s+\/set\s+\{default\}\s+recoveryenabled\s+No)/i,
    score: 25,
    level: 'critical',
    timelineLabel: 'Impact',
    timelineDetail: 'System recovery shadow copies deletion command detected.'
  },
  {
    id: 'encryption_loop',
    name: 'Data Encryption payload',
    tactic: 'Impact',
    techniqueId: 'T1486',
    techniqueName: 'Data Encrypted for Impact',
    desc: 'Performs file encryption routines or demands ransom.',
    regex: /(\.wraith|\.locked|CryptoAPI|CryptEncrypt|CryptGenKey|ransomNote|RESTORE_FILES)/i,
    score: 20,
    level: 'critical',
    timelineLabel: 'Impact',
    timelineDetail: 'Ransomware encryption signatures / file lock extension markers found.'
  }
];

/** Cap on extracted string material. Exceeding it means partial coverage, which
 *  the report states rather than silently reporting fewer matches. */
const MAX_SCAN_CHARS = 2_000_000;

export class StaticConnector implements SandboxConnector {
  readonly name = 'static';

  async detonate(input: SampleInput, onProgress: ProgressFn, predetermined?: Report | null): Promise<Report> {
    const lines = [
      'Reading sample bytes from quarantine',
      'Extracting printable ASCII and UTF-16 strings',
      'Matching strings against signature rules',
      'Extracting network indicators (IP / domain literals)',
      'Scoring matched signatures',
      'Assembling static analysis report',
    ];

    for (let i = 0; i < lines.length; i++) {
      await sleep(config.simStepMs);
      await onProgress({
        progress: Math.min(100, Math.round(((i + 1) / lines.length) * 100)),
        line: { n: pad2(i + 1), txt: lines[i] },
      });
    }

    if (predetermined) return predetermined;

    // ---- Gather the only material this engine can read ----------------------
    // Strings from the retained bytes, plus the submitted URL if there was one.
    // If neither is available there is nothing to analyze, and the only honest
    // outcome is "inconclusive" — never a clean verdict.
    let content = '';
    let truncated = false;
    let scanned = false;
    let reason = '';

    if (input.quarantinePath) {
      try {
        const extracted = extractStrings(await readFile(input.quarantinePath));
        content = extracted.text;
        truncated = extracted.truncated;
        scanned = true;
      } catch (err) {
        reason = `the retained bytes could not be read (${err instanceof Error ? err.message : String(err)})`;
        logger.warn('static', reason);
      }
    } else if (input.source === 'upload') {
      reason = 'the submitted bytes were not retained, so there was nothing to read (set RETAIN_BYTES=true)';
      logger.warn('static', reason);
    }

    if (input.url) {
      // The URL string itself is real, scannable material — the target is never fetched.
      content += '\n' + input.url;
      scanned = true;
      if (!input.quarantinePath) {
        truncated = false;
        reason = 'only the submitted URL string was available to scan — the remote file was not fetched';
      }
    }

    const base = generateReport(input, guessCategoryFromFilename(input.name));

    if (!scanned) return inconclusiveReport(base, reason);

    // ---- Match signatures ---------------------------------------------------
    const matched = RULES.filter((rule) => rule.regex.test(content));
    const score = Math.min(98, matched.reduce((acc, rule) => acc + rule.score, 0));

    const ips = extractIps(content);
    const domains = extractDomains(content);

    base.provenance = staticProvenance({ truncated, urlOnly: !input.quarantinePath && !!input.url });

    // Static scanning observes no execution and no traffic. Rather than inherit
    // the hash-synthesized stand-ins from generateReport, drop them outright —
    // the UI renders these sections as "not observed by this engine".
    base.timeline = [];
    base.blast = [];

    base.network = {
      victim: '—',
      domain: domains.length > 0 ? defang(domains[0]) : '—',
      proto: 'Not observed',
      beacon: 'Not observed',
      exfil: 'Not observed',
      ja3: '—',
      // Extracted literals are real evidence; the role is what we know, not a guess
      // about what the address does. No geolocation is performed, so none is shown.
      ips: ips.map((ip) => ({ ip, role: 'IP literal in strings', geo: '—' })),
      log: [],
    };

    if (matched.length === 0) {
      return noMatchReport(base, truncated, ips.length, domains.length);
    }

    const sev = scoreToSeverity(score);
    base.severity = score;
    base.sevLevel = sev.level;
    base.sevLabel = sev.label;
    // scoreToSeverity's verdict vocabulary ("Malicious" / "Very high") is calibrated
    // for observed behavior. Strings are weaker evidence than behavior — they can be
    // inert, quoted, or planted — so this engine never claims more than "suspicious",
    // and its confidence is capped regardless of how high the weights add up.
    base.verdict = 'Suspicious — static signatures matched';
    base.confidence = matched.length >= 4 ? 'Moderate — string evidence only' : 'Low — string evidence only';

    // Kill chain — grouped straight from the matched rules. This is the section
    // static analysis can genuinely support, so it carries all the real findings.
    const stages = new Map<string, KillChainStage>();
    for (const rule of matched) {
      let stage = stages.get(rule.tactic);
      if (!stage) {
        const meta = getTacticMetadata(rule.tactic);
        stage = { tactic: rule.tactic, id: meta.id, level: rule.level, short: meta.short, plain: meta.plain, techniques: [] };
        stages.set(rule.tactic, stage);
      }
      if (!stage.techniques.some((t) => t.id === rule.techniqueId)) {
        stage.techniques.push({ id: rule.techniqueId, name: rule.techniqueName, desc: rule.desc });
      }
      stage.level = maxLevel(stage.level, rule.level);
    }
    base.killchain = Array.from(stages.values());

    base.classification = `Static signature match — ${matched.length} rule${matched.length === 1 ? '' : 's'}`;

    base.tiles = [
      { l: 'Matched signatures', v: String(matched.length), hot: true },
      { l: 'IP literals found', v: String(ips.length), hot: ips.length > 0 },
      { l: 'Domain literals found', v: String(domains.length), hot: domains.length > 0 },
    ];

    // Each factor is asserted only from the rule that actually fired.
    base.factors = [
      { label: 'Encryption / ransom strings present', on: has(matched, 'encryption_loop'), level: 'critical' },
      { label: 'Recovery-inhibition strings present', on: has(matched, 'vss_delete'), level: 'critical' },
      { label: 'Download / transfer strings present', on: has(matched, 'certutil'), level: 'high' },
      { label: 'Autostart strings present', on: has(matched, 'scheduled_task', 'registry_run'), level: 'high' },
      { label: 'Lateral-movement strings present', on: has(matched, 'lateral_smb'), level: 'high' },
      { label: 'Credential-theft strings present', on: has(matched, 'cred_dumping', 'browser_theft', 'crypto_wallet'), level: 'high' },
      { label: 'Defense-evasion strings present', on: has(matched, 'disable_av', 'clear_logs'), level: 'high' },
    ];

    base.tagline =
      `Matched ${matched.length} static signature${matched.length === 1 ? '' : 's'}: ` +
      matched.slice(0, 3).map((r) => r.name).join(', ') +
      (matched.length > 3 ? ` (+${matched.length - 3} more)` : '');

    base.summary =
      `String matching against ${input.name} fired ${matched.length} of ${RULES.length} signature rules, ` +
      `spanning ${base.killchain.map((k) => k.tactic).join(', ')}. ` +
      `${ips.length} IP and ${domains.length} domain literal(s) were extracted from the strings. ` +
      `The score of ${score}/100 is the sum of the matched rule weights — it reflects how many suspicious ` +
      `strings are present, not what the sample does when run. ` +
      (truncated ? 'Coverage was partial (see the engine note). ' : '') +
      `Confirm against a real detonation before acting on this.`;

    return base;
  }
}

/** Provenance for a completed static scan. */
function staticProvenance(opts: { truncated: boolean; urlOnly: boolean }): Provenance {
  let caveat =
    'Signature matching over strings extracted from the file. Nothing was executed, so no runtime behavior, ' +
    'timeline, blast radius, or network traffic was observed. Packed, encrypted, or obfuscated samples ' +
    'will not match these rules and can appear clean.';
  if (opts.urlOnly) {
    caveat += ' Only the submitted URL string was scanned — the remote file was never fetched.';
  }
  if (opts.truncated) {
    caveat += ` Coverage was partial: only the first ${(MAX_SCAN_CHARS / 1_000_000).toFixed(0)} million extracted characters were scanned.`;
  }
  return {
    engine: 'static',
    label: 'Static string analysis',
    synthetic: false,
    caveat,
    unsupported: ['timeline', 'blast', 'network.traffic'],
  };
}

/**
 * No signatures fired. This is a weak negative, not a clean bill of health, and
 * the report says so — the previous behavior of returning "Benign / Low Risk"
 * here was the single most misleading outcome this engine could produce.
 */
function noMatchReport(base: Report, truncated: boolean, ipCount: number, domainCount: number): Report {
  base.severity = 0;
  base.sevLevel = 'info';
  base.sevLabel = 'NO MATCH';
  base.verdict = 'No signatures matched';
  base.confidence = truncated ? 'None — partial coverage' : 'Low';
  base.classification = 'Not classified — signature miss is not an all-clear';
  base.killchain = [];
  // No rules fired, so there is no ATT&CK mapping to show — mark it rather than
  // rendering an empty list that reads as "we looked and found a clean chain".
  if (base.provenance && !base.provenance.unsupported.includes('killchain')) {
    base.provenance = { ...base.provenance, unsupported: [...base.provenance.unsupported, 'killchain'] };
  }
  base.tiles = [
    { l: 'Matched signatures', v: '0', hot: false },
    { l: 'IP literals found', v: String(ipCount), hot: ipCount > 0 },
    { l: 'Domain literals found', v: String(domainCount), hot: domainCount > 0 },
  ];
  base.factors = base.factors.map((f) => ({ ...f, on: false }));
  base.tagline = 'No static signatures matched — this does not mean the sample is safe.';
  base.summary =
    `None of the ${RULES.length} signature rules matched the strings extracted from this sample. ` +
    'That is a weak negative: string matching cannot see inside packed, encrypted, or obfuscated code, ' +
    'which describes most real malware. ' +
    (truncated ? 'Coverage was also partial. ' : '') +
    'Treat this as "not detected by these rules", not as "benign".';
  return base;
}

/** There was nothing to read. Report that plainly instead of scoring a guess. */
function inconclusiveReport(base: Report, reason: string): Report {
  base.severity = 0;
  base.sevLevel = 'info';
  base.sevLabel = 'INCONCLUSIVE';
  base.verdict = 'Not analyzed';
  base.confidence = 'None';
  base.classification = 'Inconclusive — no material to scan';
  base.killchain = [];
  base.timeline = [];
  base.blast = [];
  base.tiles = [
    { l: 'Matched signatures', v: '—', hot: false },
    { l: 'IP literals found', v: '—', hot: false },
    { l: 'Domain literals found', v: '—', hot: false },
  ];
  base.factors = base.factors.map((f) => ({ ...f, on: false }));
  base.network = {
    victim: '—', domain: '—', proto: 'Not observed', beacon: 'Not observed',
    exfil: 'Not observed', ja3: '—', ips: [], log: [],
  };
  base.tagline = 'No analysis was performed on this sample.';
  base.summary = `This sample was never scanned because ${reason}. No conclusion about it — in either direction — can be drawn from this report.`;
  base.provenance = {
    engine: 'static',
    label: 'Static string analysis (did not run)',
    synthetic: false,
    caveat: `No analysis was performed: ${reason}.`,
    unsupported: ['killchain', 'timeline', 'blast', 'network', 'network.traffic'],
  };
  return base;
}

function has(matched: StaticRule[], ...ids: string[]): boolean {
  return matched.some((r) => ids.includes(r.id));
}

/** Render a domain non-clickable. Every dot, not just the first. */
function defang(domain: string): string {
  return domain.split('.').join('[.]');
}

function extractIps(content: string): string[] {
  const re = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  return Array.from(new Set(content.match(re) || [])).filter((ip) => {
    const o = ip.split('.').map(Number);
    if (o.some((n) => n > 255)) return false;
    const [a, b] = o;
    if (a === 0 || a === 127 || a >= 224) return false;      // this-network, loopback, multicast/reserved
    if (a === 10) return false;                               // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return false;        // RFC1918
    if (a === 192 && b === 168) return false;                 // RFC1918
    if (a === 169 && b === 254) return false;                 // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return false;       // CGNAT
    return true;
  });
}

function extractDomains(content: string): string[] {
  const re = /\b[a-zA-Z0-9][-a-zA-Z0-9._]+[a-zA-Z0-9]\.(?:com|net|org|io|xyz|cc|ru|biz|info|cn|pa|ua)\b/gi;
  const noise = new Set(['example.com', 'google.com', 'microsoft.com', 'w3.org', 'schemas.xmlsoap.org']);
  return Array.from(new Set((content.match(re) || []).map((d) => d.toLowerCase()))).filter((d) => !noise.has(d));
}

/**
 * Pull printable ASCII and UTF-16LE runs (length >= 4) out of a buffer, the way
 * `strings(1)` does. Reports truncation so partial coverage is never mistaken
 * for a complete scan.
 */
function extractStrings(buf: Buffer): { text: string; truncated: boolean } {
  const out: string[] = [];
  let len = 0;
  let truncated = false;

  const push = (chars: string[]): boolean => {
    if (chars.length < 4) return true;
    const s = chars.join('');
    if (len + s.length > MAX_SCAN_CHARS) {
      truncated = true;
      return false;
    }
    out.push(s);
    len += s.length + 1;
    return true;
  };

  let current: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 32 && b <= 126) {
      current.push(String.fromCharCode(b));
    } else {
      if (!push(current)) { current = []; break; }
      current = [];
    }
  }
  if (!truncated) push(current);

  if (!truncated) {
    current = [];
    for (let i = 0; i < buf.length - 1; i += 2) {
      const b1 = buf[i];
      if (buf[i + 1] === 0 && b1 >= 32 && b1 <= 126) {
        current.push(String.fromCharCode(b1));
      } else {
        if (!push(current)) { current = []; break; }
        current = [];
      }
    }
    if (!truncated) push(current);
  }

  return { text: out.join('\n'), truncated };
}

function guessCategoryFromFilename(filename: string): FileCategory {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (['dll', 'sys'].includes(ext)) return 'dll';
  if (['msi', 'cab'].includes(ext)) return 'msi';
  if (['exe', 'scr'].includes(ext)) return 'pe';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office';
  if (['apk', 'dex'].includes(ext)) return 'apk';
  if (['js', 'vbs', 'ps1', 'bat', 'cmd', 'sh', 'hta', 'wsf'].includes(ext)) return 'script';
  if (['zip', 'rar', 'tar', 'gz', 'jar'].includes(ext)) return 'archive';
  return 'unknown';
}

function maxLevel(a: Level, b: Level): Level {
  const levels: Level[] = ['none', 'info', 'low', 'medium', 'high', 'critical'];
  return levels.indexOf(a) >= levels.indexOf(b) ? a : b;
}

function getTacticMetadata(tactic: string): { id: string; short: string; plain: string } {
  switch (tactic) {
    case 'Initial Access': return { id: 'TA0001', short: 'Access', plain: 'Strings associated with delivery or entry onto a machine were present in the file.' };
    case 'Execution': return { id: 'TA0002', short: 'Exec', plain: 'Strings that invoke interpreters or spawn processes were present in the file.' };
    case 'Persistence': return { id: 'TA0003', short: 'Persist', plain: 'Strings referencing autostart locations were present in the file.' };
    case 'Privilege Escalation': return { id: 'TA0004', short: 'PrivEsc', plain: 'Strings naming auto-elevating system binaries were present in the file.' };
    case 'Defense Evasion': return { id: 'TA0005', short: 'Evade', plain: 'Strings that disable defenses or clear logs were present in the file.' };
    case 'Credential Access': return { id: 'TA0006', short: 'Cred', plain: 'Strings referencing credential stores were present in the file.' };
    case 'Discovery': return { id: 'TA0007', short: 'Disc', plain: 'Strings that enumerate hosts or connections were present in the file.' };
    case 'Lateral Movement': return { id: 'TA0008', short: 'Lateral', plain: 'Strings naming administrative network shares were present in the file.' };
    case 'Collection': return { id: 'TA0009', short: 'Collect', plain: 'Strings referencing input-capture APIs were present in the file.' };
    case 'Command and Control': return { id: 'TA0011', short: 'C2', plain: 'Strings associated with remote command channels were present in the file.' };
    case 'Exfiltration': return { id: 'TA0010', short: 'Exfil', plain: 'Strings associated with outbound data transfer were present in the file.' };
    case 'Impact': return { id: 'TA0040', short: 'Impact', plain: 'Strings associated with encryption or destruction were present in the file.' };
    default: return { id: 'TA9999', short: 'Unknown', plain: 'Suspicious strings were present in the file.' };
  }
}
