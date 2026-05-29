/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'google-blue': '#1a73e8',
        'google-blue-dark': '#1557b0',
        'google-blue-light': '#e8f0fe',
        'google-gray': '#5f6368',
        'google-dark': '#202124',
        'google-border': '#dadce0',
        'google-bg': '#f8f9fa',
      },
      fontFamily: {
        sans: ['Google Sans', 'Roboto', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'google': '0 1px 3px 0 rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)',
        'google-sm': '0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)',
      }
    },
  },
  plugins: [],
}
