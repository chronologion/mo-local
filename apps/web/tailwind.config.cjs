/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: '#0b1221',
        panel: '#0f172a',
        accent: '#8b5cf6',
        accent2: '#22d3ee',
        border: '#1f2937',
      },
      boxShadow: {
        card: '0 12px 40px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
};
