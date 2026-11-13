/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        surface: {
          50: '#181b26',
          100: '#141722',
          200: '#10131d',
          300: '#0d0f17',
          400: '#090a10',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.07)',
          hover: 'rgba(255, 255, 255, 0.15)',
          active: 'rgba(249, 115, 22, 0.4)',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-brand': '0 0 20px -5px rgba(249, 115, 22, 0.3)',
        'subtle': '0 2px 10px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
}
