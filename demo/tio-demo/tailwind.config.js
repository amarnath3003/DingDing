/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tio: {
          dark: '#0a0a0f',
          darker: '#050508',
          gold: '#d4a843',
          goldLight: '#f0d895',
          goldDark: '#9c7a2e',
          cream: '#faf8f3',
          gray: '#1a1a24',
          grayLight: '#2a2a3a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      zIndex: {
        '-10': '-10',
        '-20': '-20',
        '-50': '-50',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ring': 'ring 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.8s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
        'scale-in': 'scaleIn 0.4s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        ring: {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(212, 168, 67, 0.7)' },
          '50%': { transform: 'scale(1.05)', boxShadow: '0 0 0 20px rgba(212, 168, 67, 0)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(212, 168, 67, 0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}