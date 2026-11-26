import { createTheme, type MantineColorsTuple } from '@mantine/core';
import classes from './theme.module.scss';

// Terracotta accent, after the fired-clay shards (ostraka) the app is named for.
// Shade 6 (light) and 3 (dark) match --os-accent and pass 4.5:1 on their backgrounds.
const accent: MantineColorsTuple = [
  '#fdf1ec',
  '#f9e0d4',
  '#f2c0a8',
  '#ec9a72',
  '#e47f52',
  '#cf643a',
  '#a8492a',
  '#8c3d23',
  '#70311c',
  '#552514',
];

/**
 * Compact Mantine theme: small default control sizes and a tight spacing scale,
 * tuned for information density (spreadsheet-like rather than marketing-like).
 */
export const theme = createTheme({
  fontFamily: 'var(--os-font)',
  fontFamilyMonospace: 'var(--os-font-mono)',
  primaryColor: 'accent',
  colors: { accent },
  primaryShade: { light: 6, dark: 3 },
  // Dark text on the light dark-mode accent, white on the deep light-mode one.
  autoContrast: true,
  defaultRadius: 'sm',
  cursorType: 'pointer',
  fontSizes: { xs: '11px', sm: '12px', md: '13px', lg: '15px', xl: '18px' },
  spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
  headings: {
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '18px', lineHeight: '1.3' },
      h2: { fontSize: '15px', lineHeight: '1.3' },
      h3: { fontSize: '13px', lineHeight: '1.3' },
    },
  },
  components: {
    Button: { defaultProps: { size: 'xs' } },
    ActionIcon: { defaultProps: { size: 'sm', variant: 'subtle' } },
    TextInput: { defaultProps: { size: 'xs' } },
    NumberInput: { defaultProps: { size: 'xs' } },
    Select: { defaultProps: { size: 'xs' } },
    Checkbox: { defaultProps: { size: 'xs' } },
    Tooltip: { defaultProps: { openDelay: 400, fz: 'xs' } },
    Modal: { classNames: { inner: classes.modalInner, content: classes.modalContent } },
  },
});
