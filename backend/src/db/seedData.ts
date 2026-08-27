import type { Provenance, Report } from '../types.js';
/**
 * The seeded library entries are hand-written narratives from the design mockup.
 * They are not analysis output and never were, so they carry a synthetic stamp.
 */
const SEED_PROVENANCE: Provenance = {
  engine: 'seed',
  label: 'Prepared demo sample',
  synthetic: true,
  caveat:
    'This is a hand-written example report shipped with the app to demonstrate the interface. No sample was analyzed and none of the values below were measured.',
  unsupported: [],
};


// The two prepared sample reports, transcribed verbatim from the approved design
// so the seeded library renders identically. IDs are deterministic so re-seeding
// is idempotent. These are entirely synthetic threat-intel narratives — no live
// malware, IOCs, or executable content is shipped.

export const WRAITHLOCK: Report = {
  provenance: SEED_PROVENANCE,
  id: '00000000-0000-4000-8000-000000000001',
  name: 'WRAITHLOCK',
  file: 'invoice_q4_statement.pdf.exe',
  sha: 'a3f8c1e0b94d27ffae61c5d9082b41e7c6da3f1908b2e57c4419fd0a6e3b7c12',
  type: 'PE32 executable (GUI) · 1.8 MB',
  size: '1.8 MB',
  seen: '2026-06-14 22:17 UTC',
  classification: 'Ransomware (double extortion)',
  verdict: 'Malicious',
  confidence: 'Very high',
  severity: 94,
  sevLevel: 'critical',
  sevLabel: 'CRITICAL',
  tagline:
    'Encrypts files, deletes backups, and exfiltrates data for double extortion. Spreads across the network.',
  summary:
    'WRAITHLOCK is a double-extortion ransomware delivered as a fake invoice. After the user opens it, it gains admin rights, disables Windows Defender, and steals credentials. It then exfiltrates 2.4 GB of files to attacker infrastructure, deletes all local backups, and encrypts 14,000+ files before demanding payment. It also spreads to file servers across the network.',
  tiles: [
    { l: 'Files encrypted', v: '14,212', hot: true },
    { l: 'Data exfiltrated', v: '2.41 GB', hot: true },
    { l: 'Hosts compromised', v: '2', hot: true },
  ],
  factors: [
    { label: 'Destructive — encrypts data', on: true, level: 'critical' },
    { label: 'Inhibits system recovery', on: true, level: 'critical' },
    { label: 'Exfiltrates data (double extortion)', on: true, level: 'critical' },
    { label: 'Spreads laterally', on: true, level: 'high' },
    { label: 'Steals credentials', on: true, level: 'high' },
    { label: 'Disables security defenses', on: true, level: 'high' },
  ],
  killchain: [
    {
      tactic: 'Initial Access', id: 'TA0001', level: 'high', short: 'Access',
      plain: 'The victim received a phishing email and opened an attachment disguised as an invoice PDF — this is how the malware first got onto the machine.',
      techniques: [{ id: 'T1566.001', name: 'Spearphishing Attachment', desc: 'Delivered as invoice_q4_statement.pdf.exe via a targeted email.' }],
    },
    {
      tactic: 'Execution', id: 'TA0002', level: 'high', short: 'Exec',
      plain: 'Once opened, the file ran and launched a hidden PowerShell process to carry out the rest of the attack.',
      techniques: [
        { id: 'T1204.002', name: 'User Execution: Malicious File', desc: 'User double-clicked the executable, launching the payload.' },
        { id: 'T1059.001', name: 'PowerShell', desc: 'Spawned powershell.exe -w hidden with an encoded command block.' },
      ],
    },
    {
      tactic: 'Persistence', id: 'TA0003', level: 'medium', short: 'Persist',
      plain: 'The malware set itself to relaunch automatically so it survives reboots and stays on the machine.',
      techniques: [
        { id: 'T1547.001', name: 'Registry Run Key', desc: 'Wrote HKCU\\...\\Run\\WinUpdateSvc pointing to the payload.' },
        { id: 'T1053.005', name: 'Scheduled Task', desc: 'Created task "WindowsUpdateSvc" triggered on logon.' },
      ],
    },
    {
      tactic: 'Privilege Escalation', id: 'TA0004', level: 'high', short: 'PrivEsc',
      plain: 'It tricked Windows into granting administrator rights without prompting the user — giving it full control of the system.',
      techniques: [{ id: 'T1548.002', name: 'Bypass UAC', desc: 'Abused fodhelper.exe auto-elevation to run as administrator.' }],
    },
    {
      tactic: 'Defense Evasion', id: 'TA0005', level: 'high', short: 'Evade',
      plain: 'The malware turned off antivirus and erased its tracks so defenders would not notice the attack in progress.',
      techniques: [
        { id: 'T1562.001', name: 'Disable Security Tools', desc: 'Disabled Windows Defender real-time protection.' },
        { id: 'T1070.001', name: 'Clear Windows Event Logs', desc: 'Wiped Security and System event logs.' },
        { id: 'T1027', name: 'Obfuscated Files', desc: 'Payload packed with UPX and string-encrypted.' },
      ],
    },
    {
      tactic: 'Credential Access', id: 'TA0006', level: 'critical', short: 'Cred',
      plain: 'It stole passwords from memory, including an administrator account — letting it move to other machines.',
      techniques: [{ id: 'T1003.001', name: 'LSASS Memory', desc: 'Dumped LSASS via comsvcs.dll MiniDump to harvest credentials.' }],
    },
    {
      tactic: 'Discovery', id: 'TA0007', level: 'low', short: 'Disc',
      plain: 'The malware mapped out the machine and the surrounding network to decide what to attack next.',
      techniques: [
        { id: 'T1083', name: 'File and Directory Discovery', desc: 'Enumerated user documents and shares for targets.' },
        { id: 'T1018', name: 'Remote System Discovery', desc: 'Scanned 47 hosts over SMB/LDAP.' },
        { id: 'T1057', name: 'Process Discovery', desc: 'Listed running processes to find security tools.' },
      ],
    },
    {
      tactic: 'Lateral Movement', id: 'TA0008', level: 'high', short: 'Lateral',
      plain: 'Using the stolen admin password, it copied itself to a file server elsewhere on the network.',
      techniques: [{ id: 'T1021.002', name: 'SMB / Admin Shares', desc: 'Authenticated to FILESRV01 using a stolen admin hash.' }],
    },
    {
      tactic: 'Collection', id: 'TA0009', level: 'medium', short: 'Collect',
      plain: 'It gathered up sensitive files and archived them, preparing to send them to the attacker.',
      techniques: [{ id: 'T1005', name: 'Data from Local System', desc: 'Staged documents into an encrypted archive for exfiltration.' }],
    },
    {
      tactic: 'Command and Control', id: 'TA0011', level: 'high', short: 'C2',
      plain: 'The malware phoned home to an attacker-controlled server over encrypted HTTPS to receive instructions.',
      techniques: [
        { id: 'T1071.001', name: 'Web Protocols', desc: 'HTTPS beacon to 185.220.117.44:443.' },
        { id: 'T1573.002', name: 'Asymmetric Cryptography', desc: 'TLS 1.3 channel hides command traffic.' },
      ],
    },
    {
      tactic: 'Exfiltration', id: 'TA0010', level: 'critical', short: 'Exfil',
      plain: 'Before encrypting, it uploaded 2.4 GB of company data to the attacker — used to extort the victim ("pay or we leak it").',
      techniques: [{ id: 'T1041', name: 'Exfiltration Over C2 Channel', desc: 'Uploaded 2.41 GB of staged data to the C2 server.' }],
    },
    {
      tactic: 'Impact', id: 'TA0040', level: 'critical', short: 'Impact',
      plain: 'Finally it deleted all backups and encrypted the files, making them unrecoverable, then dropped a ransom note.',
      techniques: [
        { id: 'T1486', name: 'Data Encrypted for Impact', desc: 'Encrypted 14,212 files with the .wraith extension.' },
        { id: 'T1490', name: 'Inhibit System Recovery', desc: 'Deleted Volume Shadow Copies (vssadmin delete shadows).' },
        { id: 'T1489', name: 'Service Stop', desc: 'Stopped backup and database services before encryption.' },
      ],
    },
  ],
  timeline: [
    { t: 0.0, label: 'Execution', detail: 'invoice_q4_statement.pdf.exe launched by user (explorer.exe)', level: 'high' },
    { t: 0.4, label: 'Process spawn', detail: 'powershell.exe -w hidden -enc <base64> spawned', level: 'high' },
    { t: 1.3, label: 'Persistence', detail: 'Registry Run key written: HKCU\\...\\Run\\WinUpdateSvc', level: 'medium' },
    { t: 2.1, label: 'Persistence', detail: 'Scheduled task "WindowsUpdateSvc" created (ONLOGON)', level: 'medium' },
    { t: 3.4, label: 'Privilege Escalation', detail: 'UAC bypass via fodhelper.exe — elevated to administrator', level: 'high' },
    { t: 4.2, label: 'Defense Evasion', detail: 'Windows Defender real-time protection disabled', level: 'high' },
    { t: 5.0, label: 'Defense Evasion', detail: 'Security and System event logs cleared', level: 'high' },
    { t: 6.7, label: 'Credential Access', detail: 'LSASS memory dumped (comsvcs.dll MiniDump)', level: 'critical' },
    { t: 8.3, label: 'Discovery', detail: '47 network hosts enumerated via SMB / LDAP', level: 'low' },
    { t: 10.1, label: 'Command & Control', detail: 'TLS beacon established to 185.220.117.44:443', level: 'high' },
    { t: 12.4, label: 'Lateral Movement', detail: 'Authenticated to FILESRV01 via stolen admin hash (SMB)', level: 'high' },
    { t: 15.0, label: 'Exfiltration', detail: '2.41 GB archived and exfiltrated over C2 (double extortion)', level: 'critical' },
    { t: 18.2, label: 'Impact', detail: 'Volume Shadow Copies deleted (vssadmin delete shadows)', level: 'critical' },
    { t: 19.1, label: 'Impact', detail: '14,212 files encrypted with .wraith extension', level: 'critical' },
    { t: 23.8, label: 'Impact', detail: 'Ransom note RESTORE_FILES.txt dropped to 312 folders', level: 'high' },
    { t: 24.3, label: 'Impact', detail: 'Desktop wallpaper replaced with ransom message', level: 'medium' },
  ],
  blast: [
    { key: 'origin', label: 'WKSTN-4471', sub: 'Patient zero · Finance', level: 'critical', stats: [{ n: 1, t: 'host infected' }] },
    { key: 'process', label: 'Process', sub: 'In-memory execution', level: 'high', stats: [{ n: 7, t: 'malicious processes' }, { n: 1, t: 'injected (explorer)' }] },
    { key: 'host', label: 'Host', sub: 'Local machine impact', level: 'critical', stats: [{ n: 14212, t: 'files encrypted' }, { n: 3, t: 'services stopped' }, { n: 1, t: 'backups wiped' }] },
    { key: 'network', label: 'Local Network', sub: 'Lateral spread', level: 'high', stats: [{ n: 47, t: 'hosts scanned' }, { n: 1, t: 'server compromised' }] },
    { key: 'identity', label: 'Identity & Data', sub: 'Org-wide exposure', level: 'critical', stats: [{ n: 1, t: 'domain admin stolen' }, { n: '2.41 GB', t: 'data exfiltrated' }] },
    { key: 'c2', label: 'Internet / C2', sub: 'Adversary infrastructure', level: 'high', stats: [{ n: 3, t: 'C2 IP addresses' }, { n: 1, t: 'C2 domain' }] },
  ],
  network: {
    victim: 'WKSTN-4471', domain: 'cdn-telemetry-sync[.]net', proto: 'HTTPS / TLS 1.3',
    beacon: '30s ± 20%', exfil: '2.41 GB', ja3: 'a0e9f5d64349fb13191bc781f81f42e1',
    ips: [
      { ip: '185.220.117.44', role: 'C2 / Exfil', geo: 'NL' },
      { ip: '91.219.236.18', role: 'C2 fallback', geo: 'RU' },
      { ip: '45.9.148.203', role: 'Payload host', geo: 'SC' },
    ],
    log: [
      { t: '00:10.1', e: 'TLS handshake to 185.220.117.44:443' },
      { t: '00:10.4', e: 'Beacon check-in (encrypted)' },
      { t: '00:15.0', e: 'POST /upload — 2.41 GB exfil begins' },
      { t: '00:40.3', e: 'Beacon check-in' },
      { t: '01:10.7', e: 'Beacon check-in' },
    ],
  },
};

export const GHOSTFEED: Report = {
  provenance: SEED_PROVENANCE,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'GHOSTFEED',
  file: 'teams_setup_x64.msi',
  sha: 'd41a9f6c2b08e75193ac4f0db82e6c1759fa0b3e2d4c89617aef5302b9c4e8d1',
  type: 'MSI Installer · 8.4 MB',
  size: '8.4 MB',
  seen: '2026-06-12 09:41 UTC',
  classification: 'Infostealer / Remote Access Trojan',
  verdict: 'Malicious',
  confidence: 'High',
  severity: 78,
  sevLevel: 'high',
  sevLabel: 'HIGH',
  tagline:
    'Steals browser passwords and crypto wallets, logs keystrokes, and opens a persistent remote-access channel.',
  summary:
    'GHOSTFEED masquerades as a Microsoft Teams installer. On launch it harvests saved browser passwords, cookies, and cryptocurrency wallet files, starts a keylogger, and establishes a persistent remote-access trojan that lets the operator control the host on demand. It is stealthy and non-destructive — built for long-term espionage rather than immediate damage.',
  tiles: [
    { l: 'Credentials stolen', v: '214', hot: true },
    { l: 'Crypto wallets', v: '3', hot: true },
    { l: 'Data exfiltrated', v: '46 MB', hot: true },
  ],
  factors: [
    { label: 'Steals credentials', on: true, level: 'critical' },
    { label: 'Persistent remote access', on: true, level: 'high' },
    { label: 'Exfiltrates data', on: true, level: 'high' },
    { label: 'Injects into processes', on: true, level: 'medium' },
    { label: 'Spreads laterally', on: false, level: 'high' },
    { label: 'Destructive — encrypts data', on: false, level: 'critical' },
  ],
  killchain: [
    {
      tactic: 'Initial Access', id: 'TA0001', level: 'high', short: 'Access',
      plain: 'The victim was lured to download a fake Teams installer from a phishing link.',
      techniques: [{ id: 'T1566.002', name: 'Spearphishing Link', desc: 'Download link to a trojanized installer.' }],
    },
    {
      tactic: 'Execution', id: 'TA0002', level: 'high', short: 'Exec',
      plain: 'Running the installer launched the hidden malware payload.',
      techniques: [
        { id: 'T1204.002', name: 'User Execution', desc: 'User ran teams_setup_x64.msi.' },
        { id: 'T1059.003', name: 'Windows Command Shell', desc: 'rundll32 used to load the payload.' },
      ],
    },
    {
      tactic: 'Persistence', id: 'TA0003', level: 'medium', short: 'Persist',
      plain: 'It set itself to relaunch so the remote access survives reboots.',
      techniques: [
        { id: 'T1547.001', name: 'Registry Run Key', desc: 'Run key "TeamsUpdater" added.' },
        { id: 'T1053.005', name: 'Scheduled Task', desc: 'Task runs every 15 minutes.' },
      ],
    },
    {
      tactic: 'Defense Evasion', id: 'TA0005', level: 'medium', short: 'Evade',
      plain: 'It hid inside a trusted Windows process to avoid detection.',
      techniques: [
        { id: 'T1055', name: 'Process Injection', desc: 'Injected into explorer.exe.' },
        { id: 'T1027', name: 'Obfuscated Files', desc: 'Encrypted payload strings.' },
      ],
    },
    {
      tactic: 'Credential Access', id: 'TA0006', level: 'critical', short: 'Cred',
      plain: 'It stole saved passwords, session cookies, and crypto wallets from the machine.',
      techniques: [
        { id: 'T1555.003', name: 'Credentials from Browsers', desc: 'Copied Chrome/Edge login data.' },
        { id: 'T1539', name: 'Steal Web Session Cookie', desc: 'Harvested session cookies to bypass MFA.' },
      ],
    },
    {
      tactic: 'Collection', id: 'TA0009', level: 'high', short: 'Collect',
      plain: 'It recorded keystrokes and gathered files to send to the attacker.',
      techniques: [
        { id: 'T1056.001', name: 'Keylogging', desc: 'Captured keystrokes and clipboard.' },
        { id: 'T1005', name: 'Data from Local System', desc: 'Collected wallet files and documents.' },
      ],
    },
    {
      tactic: 'Command and Control', id: 'TA0011', level: 'high', short: 'C2',
      plain: 'It opened a remote channel letting the operator control the machine at will.',
      techniques: [
        { id: 'T1071.001', name: 'Web Protocols', desc: 'HTTPS beacon to api-sync-telemetry[.]io.' },
        { id: 'T1219', name: 'Remote Access Software', desc: 'Interactive remote shell opened.' },
      ],
    },
  ],
  timeline: [
    { t: 0.0, label: 'Execution', detail: 'teams_setup_x64.msi executed; spawns rundll32', level: 'high' },
    { t: 0.6, label: 'Defense Evasion', detail: 'Payload injected into explorer.exe', level: 'medium' },
    { t: 1.4, label: 'Persistence', detail: 'Run key "TeamsUpdater" written', level: 'medium' },
    { t: 2.2, label: 'Persistence', detail: 'Scheduled task created (every 15 minutes)', level: 'medium' },
    { t: 3.6, label: 'Credential Access', detail: 'Chrome/Edge login data and cookies copied', level: 'critical' },
    { t: 4.9, label: 'Credential Access', detail: 'Crypto wallet files harvested (3 wallets)', level: 'critical' },
    { t: 6.1, label: 'Collection', detail: 'Keylogger started; clipboard hooked', level: 'high' },
    { t: 7.4, label: 'Command & Control', detail: 'TLS beacon to api-sync-telemetry[.]io', level: 'high' },
    { t: 9.0, label: 'Command & Control', detail: 'Remote shell opened; awaiting operator', level: 'high' },
  ],
  blast: [
    { key: 'origin', label: 'WKSTN-2210', sub: 'Patient zero · Engineering', level: 'high', stats: [{ n: 1, t: 'host infected' }] },
    { key: 'process', label: 'Process', sub: 'In-memory execution', level: 'medium', stats: [{ n: 4, t: 'processes' }, { n: 1, t: 'injected (explorer)' }] },
    { key: 'host', label: 'Host', sub: 'Local machine impact', level: 'high', stats: [{ n: 214, t: 'credentials read' }, { n: 3, t: 'wallets harvested' }] },
    { key: 'network', label: 'Local Network', sub: 'No lateral spread', level: 'low', stats: [{ n: 0, t: 'hosts compromised' }, { n: 1, t: 'host beaconing' }] },
    { key: 'identity', label: 'Identity & Data', sub: 'Org-wide exposure', level: 'critical', stats: [{ n: 18, t: 'session cookies stolen' }, { n: '46 MB', t: 'data exfiltrated' }] },
    { key: 'c2', label: 'Internet / C2', sub: 'Adversary infrastructure', level: 'high', stats: [{ n: 2, t: 'C2 IP addresses' }, { n: 1, t: 'C2 domain' }] },
  ],
  network: {
    victim: 'WKSTN-2210', domain: 'api-sync-telemetry[.]io', proto: 'HTTPS / TLS 1.2',
    beacon: '60s ± 30%', exfil: '46 MB', ja3: '51c64c77e60f3980eea90869b68c58a8',
    ips: [
      { ip: '45.137.21.88', role: 'C2', geo: 'RO' },
      { ip: '193.42.33.7', role: 'Payload / Exfil', geo: 'BG' },
    ],
    log: [
      { t: '00:07.4', e: 'TLS handshake to 45.137.21.88:443' },
      { t: '00:07.9', e: 'Beacon check-in (host fingerprint)' },
      { t: '00:12.2', e: 'POST /sync — 46 MB exfil (creds + cookies)' },
      { t: '01:07.8', e: 'Beacon check-in' },
      { t: '02:07.5', e: 'Operator opened remote shell' },
    ],
  },
};

export const SEED_REPORTS: Report[] = [WRAITHLOCK, GHOSTFEED];
