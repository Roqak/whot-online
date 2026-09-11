/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#1a5c3a',
          dark: '#0f3d26',
          light: '#2d7a52',
        },
        whot: {
          circle: '#e74c3c',
          triangle: '#f39c12',
          cross: '#3498db',
          square: '#2ecc71',
          star: '#9b59b6',
          wild: '#f1c40f',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'safe': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
}
