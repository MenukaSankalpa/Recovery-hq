import './globals.css';

export const metadata = {
  title: 'Recovery HQ',
  description: 'Credit recovery war room — assign, collect, track',
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#05080f' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="icon" href="/icon.svg" />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
