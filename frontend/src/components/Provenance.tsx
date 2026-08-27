import type { Provenance, ReportSection } from '../types';

/**
 * Reports carry a `provenance` stamp describing which engine produced them and
 * which sections that engine has no evidence for. These two components are the
 * UI half of that contract: a banner stating what you are looking at, and an
 * explicit placeholder wherever a section would otherwise be filled with
 * plausible-looking values nothing actually measured.
 */

const UNKNOWN: Provenance = {
  engine: 'unknown',
  label: 'Unknown engine',
  synthetic: false,
  caveat:
    'This report predates provenance tracking, so which engine produced it — and how much of it was measured — is not recorded.',
  unsupported: [],
};

export function provenanceOf(p?: Provenance): Provenance {
  return p ?? UNKNOWN;
}

export function isUnsupported(p: Provenance | undefined, section: ReportSection): boolean {
  return provenanceOf(p).unsupported.includes(section);
}

export function ProvenanceBanner({ provenance }: { provenance?: Provenance }) {
  const p = provenanceOf(provenance);
  // Fabricated content is the strongest claim to flag; a real-but-limited engine
  // gets the quieter treatment.
  const strong = p.synthetic || p.engine === 'unknown';
  const accent = strong ? '#B23A2E' : '#807B72';

  return (
    <div
      role="note"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '13px 16px',
        marginBottom: 30,
        borderRadius: 3,
        border: `1px solid ${accent}40`,
        background: `${accent}0F`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: accent,
          flex: 'none',
          marginTop: 6,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: accent,
          }}
        >
          {p.synthetic ? `${p.label} · synthetic report` : p.label}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: '#46443D',
            marginTop: 5,
            textWrap: 'pretty',
          }}
        >
          {p.caveat}
        </div>
      </div>
    </div>
  );
}

export function NotObserved({
  title,
  body,
  provenance,
}: {
  title: string;
  body: string;
  provenance?: Provenance;
}) {
  const p = provenanceOf(provenance);
  return (
    <div
      style={{
        marginTop: 34,
        padding: '46px 32px',
        border: '1px dashed rgba(26,25,21,0.26)',
        borderRadius: 4,
        textAlign: 'center',
        background: 'rgba(26,25,21,0.02)',
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: '#807B72',
        }}
      >
        Not observed
      </div>
      <div
        style={{
          fontSize: 19,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          margin: '12px 0 0',
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: '#6E6A60',
          maxWidth: 560,
          margin: '10px auto 0',
          textWrap: 'pretty',
        }}
      >
        {body}
      </p>
      <div
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11,
          color: '#A6A29A',
          marginTop: 16,
        }}
      >
        Engine — {p.label}
      </div>
    </div>
  );
}
