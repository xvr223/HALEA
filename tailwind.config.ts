import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0a0a0d',
        s1:      '#0f0f14',
        s2:      '#14141b',
        s3:      '#1b1b24',
        s4:      '#23232e',
        s5:      '#2c2c3a',
        b1:      '#262630',
        b2:      '#34343f',
        b3:      '#444452',
        accent:  '#ff6b35',
        a2:      '#ffd23f',
        a3:      '#3ddfd5',
        a4:      '#b388ff',
        ok:      '#3dd88a',
        err:     '#ff5562',
        warn:    '#ffb13f',
        txt:     '#f2f0ec',
        t2:      '#8e8c98',
        t3:      '#4a4a56',
      },
      fontFamily: {
        sans:  ['var(--font-syne)', 'system-ui', 'sans-serif'],
        mono:  ['var(--font-dm-mono)', 'monospace'],
        serif: ['var(--font-fraunces)', 'serif'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn .3s ease',
        'slide-up':   'slideUp .3s ease',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
export default config
