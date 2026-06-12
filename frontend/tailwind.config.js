/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
        display: ['Barlow Condensed', 'IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace']
      },
      colors: {
        void: '#0A0E16',
        panel: '#101624',
        well: '#0C111D',
        line: '#222B3D',
        ink: '#E9EDF6',
        dim: '#9AA4BA',
        faint: '#5F6A85',
        amber: '#FFB52E',
        up: '#2FD584',
        down: '#FF5C5C',
        info: '#6AA6FF'
      }
    }
  },
  plugins: []
};
