import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0B0F14',
        panel: '#111827',
        primary: '#E5E7EB',
        muted: '#9CA3AF',
        border: '#1F2937',
        safe: '#22C55E',
        warning: '#FACC15',
        danger: '#EF4444',
        accent: '#22D3EE',
      },
      fontFamily: {
        mono: ['var(--font-inter)', 'Menlo', 'monospace'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['12px', '16px'],
        sm: ['14px', '20px'],
        base: ['16px', '24px'],
        lg: ['20px', '28px'],
        xl: ['24px', '32px'],
        '2xl': ['32px', '40px'],
        '4xl': ['48px', '56px'],
        '5xl': ['56px', '64px'],
      },
      spacing: {
        // 8px grid: 4, 8, 16, 24, 32, 48, 64
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
        16: '64px',
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        full: '9999px',
      },
      boxShadow: {
        panel: '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)',
        safe: '0 0 24px rgb(34 197 94 / 0.2)',
        warning: '0 0 24px rgb(250 204 21 / 0.2)',
        danger: '0 0 24px rgb(239 68 68 / 0.2)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
