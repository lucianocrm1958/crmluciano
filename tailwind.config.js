/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#EEF2F8",
          100: "#D6E0EE",
          200: "#AEC1DD",
          300: "#7E9AC5",
          400: "#4A6DA0",
          500: "#2C4E80",
          600: "#1F3864",
          700: "#182B4D",
          800: "#121F38",
          900: "#0C1526",
        },
        gold: {
          50: "#FBF6EA",
          100: "#F2E4C0",
          400: "#B4922F",
          500: "#8C6D1F",
          600: "#705817",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
