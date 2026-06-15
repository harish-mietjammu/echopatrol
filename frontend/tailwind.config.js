/** @type {import('tailwindcss').Config} */
const rgb = (varName) => `rgb(var(--${varName}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        echo: {
          bg:         rgb('echo-bg'),
          panel:      rgb('echo-panel'),
          'panel-2':  rgb('echo-panel-2'),
          line:       rgb('echo-line'),
          'line-soft':rgb('echo-line-soft'),
          text:       rgb('echo-text'),
          'text-2':   rgb('echo-text-2'),
          muted:      rgb('echo-muted'),
          faint:      rgb('echo-faint'),
          dim:        rgb('echo-dim'),
          accent:     rgb('echo-accent'),
          warn:       rgb('echo-warn'),
          crit:       rgb('echo-crit'),
          ok:         rgb('echo-ok'),
        },
      },
      borderColor: {
        'echo-line':      rgb('echo-line'),
        'echo-line-soft': rgb('echo-line-soft'),
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': '0.6875rem', // 11px
      },
    },
  },
  plugins: [],
};
