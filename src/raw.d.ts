/** Vite's `?raw` imports (used by tests to read index.html and theme.ts as text). */
declare module "*?raw" {
  const text: string;
  export default text;
}
