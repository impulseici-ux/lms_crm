/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef1fb",
          100: "#d9defa",
          500: "#3b4fa0",
          600: "#2f3f8a",
          700: "#28356f",
          800: "#1f2a58",
          900: "#161d40",
        },
      },
    },
  },
  plugins: [],
};
