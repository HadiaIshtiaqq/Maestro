// NEXUS Mobile Design System — Dark Command Center
export const COLORS = {
  bg:        '#121214',
  surface:   '#18181c',
  surface2:  '#1e1e24',
  surface3:  '#24242c',
  border:    '#262930',
  borderHi:  'rgba(0,240,255,0.25)',
  primary:   '#00F0FF',
  secondary: '#3a7bd5',
  accent:    '#7C3AED',
  error:     '#FF3B5C',
  warning:   '#FF8A00',
  caution:   '#FFD600',
  success:   '#00E676',
  text:      '#F0F0F2',
  muted:     'rgba(240,240,242,0.35)',
  dimmed:    'rgba(240,240,242,0.15)',
};

export const STATUS_COLOR: Record<string, string> = {
  critical:   COLORS.error,
  high:       COLORS.warning,
  medium:     COLORS.caution,
  low:        COLORS.success,
  active:     COLORS.error,
  unverified: '#F59E0B',
  retracted:  COLORS.muted,
  closed:     COLORS.muted,
};

export const SEV_GLOW: Record<string, string> = {
  critical:   'rgba(255,59,92,0.35)',
  high:       'rgba(255,138,0,0.30)',
  medium:     'rgba(255,214,0,0.25)',
  low:        'rgba(0,230,118,0.25)',
  unverified: 'rgba(245,158,11,0.25)',
};

export const FONTS = {
  mono: 'monospace' as const,
};
