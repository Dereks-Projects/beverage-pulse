import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: {
    default: 'BeveragePulse',
    template: '%s | BeveragePulse',
  },
  description: 'Beverage intelligence at the crossroads of behavioral and data science. Track what consumers are saying and searching about beverages and brands.',
  keywords: ['beverage trends', 'beverage intelligence', 'F&B', 'drink trends', 'beverage data', 'bar trends', 'cocktail trends'],
  authors: [{ name: 'Informative Media', url: 'https://informativemedia.com' }],
  creator: 'Informative Media',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'BeveragePulse',
    title: 'BeveragePulse',
    description: 'Beverage intelligence at the crossroads of behavioral and data science. Track what consumers are saying and searching about beverages and brands.',
    images: [
      {
        url: '/socialcard.png',
        width: 1200,
        height: 630,
        alt: 'BeveragePulse - Beverage Intelligence Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BeveragePulse',
    description: 'Beverage intelligence at the crossroads of behavioral and data science.',
    images: ['/socialcard.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}