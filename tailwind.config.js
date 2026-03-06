/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia'],
        mono: ['var(--font-mono)', 'ui-monospace'],
      },
      colors: {
        ink: {
          50: '#f5f3ee',
          100: '#e8e4da',
          200: '#d1cabb',
          300: '#b5a98e',
          400: '#9a8a6a',
          500: '#7d6e51',
          600: '#635742',
          700: '#4e4434',
          800: '#3d352a',
          900: '#2e271f',
          950: '#1a1610',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        sage: {
          50: '#f2f7f2',
          100: '#e0ece0',
          200: '#c3d9c3',
          300: '#9abf9a',
          400: '#6da06d',
          500: '#4e834e',
          600: '#3b683b',
          700: '#2f532f',
          800: '#274227',
          900: '#213621',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
