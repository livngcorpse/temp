'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/sockets/socketContext';

export default function DownloadNotificationToast() {
  const { downloadNotifications, clearDownloadNotifications } = useSocket();

  // Auto-clear notifications after 5 seconds
  useEffect(() => {
    if (downloadNotifications.length === 0) return;

    const timer = setTimeout(() => {
      clearDownloadNotifications();
    }, 5000);

    return () => clearTimeout(timer);
  }, [downloadNotifications, clearDownloadNotifications]);

  if (downloadNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
      <AnimatePresence>
        {downloadNotifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="w-80 overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur border border-slate-800 p-4 shadow-2xl shadow-black/50"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="flex-1 overflow-hidden">
                <h4 className="text-sm font-semibold text-slate-100">
                  File Downloaded!
                </h4>
                <p className="text-xs text-slate-400 truncate mt-1">
                  {notification.fileName}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Downloaded at {notification.timestamp}
                </p>
              </div>
              <button
                onClick={() => {
                  clearDownloadNotifications();
                }}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                aria-label="Dismiss notification"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
