import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  fonts: {
    heading: `'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    body: `'IBM Plex Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace`,
    mono: `'IBM Plex Mono', 'Courier New', monospace`,
  },
  semanticTokens: {
    colors: {
      'bg-page': { default: '#F7FAFC', _dark: '#BEBEBE' },
      'bg-card': { default: '#FFFFFF', _dark: '#D9DBCE' },
      'bg-footer': { default: '#EDEEE4', _dark: '#D9DBCE' },
      'bg-section': { default: '#F7FAFC', _dark: '#D9DBCE' },
      'bg-info': { default: '#EBF8FF', _dark: '#DADBCD' },
      'border-ui': { default: '#E2E8F0', _dark: '#262626' },
      'border-info': { default: '#BEE3F8', _dark: '#31322B' },
      'text-heading': { default: '#1A202C', _dark: '#282828' },
      'text-muted': { default: '#718096', _dark: '#31322B' },
      accent: { default: '#BD231F', _dark: '#BD231F' },
      warning: { default: '#BE1B17', _dark: '#BE1B17' },
    },
  },
  styles: {
    global: {
      body: {
        bg: 'bg-page',
      },
    },
  },
});

export default theme;
