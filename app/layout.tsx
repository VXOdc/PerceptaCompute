import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'PerceptaCompute — Object detection for motion',
  description: 'Real-time object detection and hazard awareness for runners, cyclists, and people in motion.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
