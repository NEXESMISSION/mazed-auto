/**
 * 404 for a URL outside any locale — rare, since the middleware gives every
 * page path a locale prefix (mostly a path with a dot in it, which the
 * middleware skips as a file). The root layout renders no <html> (the [locale]
 * layout does, knowing the language), so this page brings its own, and says it
 * in both languages because it cannot know which one the visitor reads.
 */
export default function RootNotFound() {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#f5f5f5",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Page introuvable</h1>
        <p lang="ar" dir="rtl" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          الصفحة غير موجودة
        </p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" style={{ marginTop: 12, color: "#f5f5f5", fontSize: 13, fontWeight: 700 }}>
          Accueil · الرئيسية
        </a>
      </body>
    </html>
  );
}
