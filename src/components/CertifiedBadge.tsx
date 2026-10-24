// Insignia de productor verificado: RUT aprobado (o verificación manual).
// Sin `label` es solo el ícono (junto a un nombre); con `label` es un tag.

interface CertifiedBadgeProps {
  label?: string
  size?: number
}

export function CertifiedIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {/* Sello con borde ondulado */}
      <path
        d="M12 1.8l2.2 1.6 2.7-.2.9 2.6 2.3 1.4-.6 2.6 1.3 2.4-1.9 1.9.1 2.7-2.6.8-1.4 2.3-2.6-.7L12 22.2l-2.2-1.6-2.7.2-.9-2.6-2.3-1.4.6-2.6L3.2 12l1.9-1.9-.1-2.7 2.6-.8 1.4-2.3 2.6.7z"
        fill="#2E7D4F"
      />
      <path d="M8 12.3l2.6 2.6L16.2 9.3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function CertifiedBadge({ label, size = 20 }: CertifiedBadgeProps) {
  const title = 'Productor verificado: RUT aprobado'
  if (!label) {
    return (
      <span title={title} aria-label={title} style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
        <CertifiedIcon size={size} />
      </span>
    )
  }
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#EAF3EC',
        color: '#205134',
        border: '1px solid #C8E6C9',
        borderRadius: 20,
        padding: '6px 14px 6px 8px',
        fontSize: 14,
        fontWeight: 800,
        fontFamily: "'Nunito Sans', sans-serif",
        whiteSpace: 'nowrap',
      }}
    >
      <CertifiedIcon size={size} />
      {label}
    </span>
  )
}
