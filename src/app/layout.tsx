import type { Metadata } from 'next';
import Providers from '@/components/providers';
import './globals.css';
export const metadata: Metadata = {
  title: 'JobHunter AI — рабочее пространство',
  description: 'Поиск вакансий, AI-анализ и управление откликами на hh.ru',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
