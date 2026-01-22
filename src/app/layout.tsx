import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LoopDeck - LLM Output Review & Curation Tool',
  description:
    'Open-source UI for reviewing, debugging, and curating LLM outputs. Built for RAG debugging and RLHF data collection.',
  keywords: ['LLM', 'RAG', 'RLHF', 'AI', 'Machine Learning', 'Fine-tuning', 'Data Curation'],
  authors: [{ name: 'LoopDeck Team' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
