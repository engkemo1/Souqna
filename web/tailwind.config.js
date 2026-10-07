/** Souqna design system — spacing, type, radii, shadows & motion are fixed;
 *  colour comes from theme tokens (CSS variables set by the Theme Engine). */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: { xs: '400px', sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' }, screens: { '2xl': '1440px' } },
    extend: {
      colors: {
        canvas: v('background'),
        surface: v('surface'),
        elevated: v('elevated'),
        fg: v('text'),
        muted: v('muted'),
        line: v('border'),
        'line-strong': v('border-strong'),
        primary: v('primary'),
        'on-primary': v('on-primary'),
        brand: v('primary-ink'),
        secondary: v('secondary'),
        'on-secondary': v('on-secondary'),
        accent: v('accent'),
        'on-accent': v('on-accent'),
        btn: v('button'),
        'on-btn': v('on-button'),
        'btn-outline': v('button-outline'),
        header: v('header'),
        'on-header': v('on-header'),
        footer: v('footer'),
        'on-footer': v('on-footer'),
        'footer-muted': v('footer-muted'),
        sale: v('sale'),
        success: v('success'),
        ring: v('ring'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Playfair Display"', '"IBM Plex Sans Arabic"', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'display-sm': ['clamp(1.75rem, 1.2rem + 2.2vw, 2.5rem)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        'display': ['clamp(2.1rem, 1.3rem + 3.4vw, 4rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 6px 20px -10px rgb(0 0 0 / 0.12)',
        lift: '0 2px 6px rgb(0 0 0 / 0.05), 0 18px 40px -18px rgb(0 0 0 / 0.25)',
        sheet: '0 -8px 40px -12px rgb(0 0 0 / 0.25)',
        ring: '0 0 0 3px rgb(var(--c-ring) / 0.35)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.22,1,.36,1)', spring: 'cubic-bezier(.34,1.56,.64,1)' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.3)' }, '100%': { transform: 'scale(1)' } },
        bump: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.35)' } },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up .5s cubic-bezier(.22,1,.36,1) both',
        pop: 'pop .45s cubic-bezier(.34,1.56,.64,1)',
        bump: 'bump .4s cubic-bezier(.34,1.56,.64,1)',
      },
    },
  },
  plugins: [],
};
