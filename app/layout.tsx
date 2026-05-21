import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PerceptaCompute — Spatial Intelligence System',
  description:
    'Real-time spatial awareness system that predicts motion-based hazards using live visual input and rule-based risk reasoning.',
  openGraph: {
    title: 'PerceptaCompute — Spatial Intelligence System',
    description:
      'Real-time spatial awareness system that predicts motion-based hazards using live visual input and rule-based risk reasoning.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <meta name="theme-color" content="#0B0F14" />
      </head>
      <body className="bg-bg text-primary antialiased min-h-screen">{children}</body>
    </html>
  );
}
