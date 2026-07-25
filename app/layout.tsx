import type { Metadata } from 'next';
import { Geist, Geist_Mono, Noto_Sans_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { Button } from '@/app/components/ui/button';
import { ThemeProvider } from '@/app/components/theme/theme-provider';
import { ThemeToggle } from '@/app/components/theme/theme-toggle';
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const notoSansMono = Noto_Sans_Mono({
  variable: '--font-noto-sans-mono',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'Conlang Studio',
  description: 'Design constructed languages, end to end.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <ClerkProvider>
            <header className="shrink-0 sticky top-0 z-40 flex justify-between items-center p-4 gap-4 h-16 bg-card text-card-foreground border-b">
              <Link href="/" className="font-semibold hover:text-primary">
                Conlang Studio
              </Link>
              <div className="flex items-center gap-4">
                <Show when="signed-out">
                  <SignInButton />
                  <SignUpButton>
                    <Button className="rounded-full">Sign Up</Button>
                  </SignUpButton>
                </Show>
                <Show when="signed-in">
                  <Link
                    href="/languages"
                    className="text-sm font-medium hover:text-primary"
                  >
                    Languages
                  </Link>
                  <UserButton />
                </Show>
                <ThemeToggle />
              </div>
            </header>
            {children}
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
