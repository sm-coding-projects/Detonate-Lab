export type FileCategory =
  | 'pe' | 'dll' | 'msi' | 'office' | 'pdf' | 'script' | 'apk' | 'archive' | 'elf' | 'unknown';

export interface SniffResult {
  category: FileCategory;
  /** Human label resembling the design's `type` field, e.g. "PE32 executable (GUI)". */
  label: string;
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Best-effort magic-byte sniffing. Never executes anything; only reads the header.
 * `nameHint` (filename/url basename) breaks ties for container formats.
 */
export function sniff(buf: Buffer, nameHint = ''): SniffResult {
  const ext = (nameHint.split('.').pop() || '').toLowerCase();

  if (startsWith(buf, [0x4d, 0x5a])) {
    // MZ — PE family. Use extension to distinguish DLL.
    if (ext === 'dll') return { category: 'dll', label: 'PE32 dynamic-link library (DLL)' };
    if (ext === 'sys') return { category: 'dll', label: 'PE32 kernel driver (SYS)' };
    return { category: 'pe', label: 'PE32 executable (GUI)' };
  }
  if (startsWith(buf, [0x7f, 0x45, 0x4c, 0x46])) return { category: 'elf', label: 'ELF executable (Linux)' };
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return { category: 'pdf', label: 'PDF document' };
  if (startsWith(buf, OLE)) {
    if (ext === 'msi') return { category: 'msi', label: 'MSI Installer' };
    if (ext === 'doc' || ext === 'xls' || ext === 'ppt') return { category: 'office', label: 'Microsoft Office (OLE) document' };
    return { category: 'msi', label: 'OLE compound binary' };
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) {
    // ZIP container — could be APK / JAR / OOXML / plain zip.
    if (ext === 'apk') return { category: 'apk', label: 'Android package (APK)' };
    if (ext === 'jar') return { category: 'archive', label: 'Java archive (JAR)' };
    if (['docx', 'xlsx', 'pptx'].includes(ext)) return { category: 'office', label: 'Microsoft Office (OOXML) document' };
    return { category: 'archive', label: 'ZIP archive' };
  }
  if (startsWith(buf, [0x64, 0x65, 0x78, 0x0a])) return { category: 'apk', label: 'Android DEX bytecode' };
  if (startsWith(buf, [0x52, 0x61, 0x72, 0x21])) return { category: 'archive', label: 'RAR archive' };
  if (startsWith(buf, [0x4d, 0x53, 0x43, 0x46])) return { category: 'msi', label: 'Microsoft Cabinet (CAB)' };

  // Script-ish: by extension or leading printable text.
  const scriptExts = ['js', 'vbs', 'ps1', 'bat', 'cmd', 'sh', 'hta', 'wsf', 'jse'];
  if (scriptExts.includes(ext)) return { category: 'script', label: `Script (${ext.toUpperCase()})` };

  const head = buf.subarray(0, 256).toString('utf8');
  if (/^\s*(<\?php|#!|<script|function|var |const |Set |@echo|powershell)/i.test(head)) {
    return { category: 'script', label: 'Script / text payload' };
  }

  return { category: 'unknown', label: 'Unknown binary' };
}

export function humanSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
  return `${n >= 100 || u === 0 ? Math.round(n) : n.toFixed(1)} ${units[u]}`;
}
