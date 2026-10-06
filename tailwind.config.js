/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'gd-dark': '#0a0a0f',
        'gd-panel': '#12121a',
        'gd-border': '#2a2a3a',
        'gd-accent': '#6c63ff',
        'gd-accent2': '#ff6584',
        'gd-green': '#43e97b',
        'gd-yellow': '#f9d423',
        'gd-red': '#f64f59',
      },
    },
  },
  plugins: [],
}
