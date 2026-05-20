import './globals.css';
import { SocketProvider } from '@/sockets/socketContext';

export const metadata = {
  title: 'QuickDrop Core',
  description: 'Temporary file sharing for developers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
