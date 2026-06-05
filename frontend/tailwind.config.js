/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif']
      },
      colors: {
        ink: '#18211f',
        paper: '#f8faf7',
        line: '#d8ded8',
        mint: '#0f8f63',
        coral: '#d84a3a',
        amber: '#d99b1f',
        cobalt: '#2563eb'
      },
      boxShadow: {
        panel: '0 14px 35px rgba(24, 33, 31, 0.08)'
      }
    }
  },
  plugins: []
};
