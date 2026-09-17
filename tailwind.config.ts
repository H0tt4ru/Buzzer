import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        stage: {
          900: 'hsl(var(--stage-900))',
          800: 'hsl(var(--stage-800))',
          700: 'hsl(var(--stage-700))',
          600: 'hsl(var(--stage-600))',
        },
        magenta: 'hsl(var(--magenta))',
        lemon: 'hsl(var(--lemon))',
        cyan: 'hsl(var(--cyan))',
        lime: 'hsl(var(--lime))',
        cream: 'hsl(var(--cream))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        ui: ['var(--font-ui)'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'buzzer-pulse': {
          '0%, 100%': { transform: 'scale(1)', filter: 'brightness(1)' },
          '50%': { transform: 'scale(1.035)', filter: 'brightness(1.12)' },
        },
        'idle-breathe': {
          '0%, 100%': { opacity: '0.72' },
          '50%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.7) translateY(0.75rem)', opacity: '0' },
          '65%': { transform: 'scale(1.06)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slam-in': {
          '0%': { transform: 'scale(2.4) rotate(-6deg)', opacity: '0' },
          '55%': { transform: 'scale(0.94) rotate(1deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        'rise-in': {
          '0%': { transform: 'translateY(2rem)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'count-flip': {
          '0%': { transform: 'scale(1.8)', opacity: '0' },
          '30%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.85)', opacity: '0' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-0.5rem)' },
          '40%': { transform: 'translateX(0.5rem)' },
          '60%': { transform: 'translateX(-0.3rem)' },
          '80%': { transform: 'translateX(0.3rem)' },
        },
        'score-bump': {
          '0%': { transform: 'scale(1)', color: 'hsl(var(--cream))' },
          '40%': { transform: 'scale(1.35)', color: 'hsl(var(--lemon))' },
          '100%': { transform: 'scale(1)', color: 'hsl(var(--cream))' },
        },
        'ticker-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--lime) / 0.5)' },
          '50%': { boxShadow: '0 0 0 0.5rem hsl(var(--lime) / 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'buzzer-pulse': 'buzzer-pulse 1.15s ease-in-out infinite',
        'idle-breathe': 'idle-breathe 3.2s ease-in-out infinite',
        'pop-in': 'pop-in 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'slam-in': 'slam-in 0.5s cubic-bezier(0.2, 0.9, 0.2, 1) both',
        'rise-in': 'rise-in 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'count-flip': 'count-flip 0.95s ease-out both',
        shake: 'shake 0.42s ease-in-out both',
        'score-bump': 'score-bump 0.6s ease-out both',
        'ticker-glow': 'ticker-glow 2s ease-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
