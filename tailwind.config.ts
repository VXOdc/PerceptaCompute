import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:             '#080b0e',
        panel:          '#0d1117',
        'panel-2':      '#111820',
        amber:          '#f59e0b',
        accent:         '#f59e0b',
        cyan:           '#22d3ee',
        border:         '#1a2230',
        'border-bright':'#243040',
        primary:        '#e2e8f0',
        muted:          '#4a5568',
      },
      fontFamily: {
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Rajdhani', 'sans-serif'],
        syne:    ['Rajdhani', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
