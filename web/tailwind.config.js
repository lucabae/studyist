/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta neutra tipo Claude/ChatGPT, sin el naranja de marca.
        // Tokens antiguos: siguen en uso en las propuestas de la home.
        surface: "#ffffff",
        "surface-muted": "#f7f7f5",
        border: "#e5e5e0",
        ink: "#1f1f1d",
        "ink-muted": "#6b6b66",
        accent: "#2f6f5e",
        // Lenguaje "Onyx": el unico acento es el blanco puro.
        onyx: {
          bg: "#212121",
          rail: "#171717",
          surface: "#303030",
          surfaceHover: "#3a3a3a",
          line: "#3f3f3f",
          ink: "#ececec",
          inkMuted: "#b4b4b4",
          inkFaint: "#8f8f8f",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
