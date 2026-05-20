'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import FileUpload from '@/components/FileUpload';
import DownloadNotificationToast from '@/components/DownloadNotificationToast';

export default function Home() {
  const [apiStatus, setApiStatus] = useState(null);

  const checkApiStatus = async () => {
    try {
      const response = await fetch('http://localhost:4000/api/health');
      if (response.ok) {
        setApiStatus('ready');
      }
    } catch (error) {
      setApiStatus('offline');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="space-y-6 text-center">
          <p className="inline-flex rounded-full bg-slate-800 px-4 py-1 text-sm uppercase tracking-[0.35em] text-sky-300">
            QuickDrop Core
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl font-semibold sm:text-5xl lg:text-6xl"
          >
            Fast temporary file sharing for developers.
          </motion.h1>
          <p className="mx-auto max-w-2xl text-slate-400">
            Upload files instantly, share secure temporary links, and keep uploads temporary with automatic cleanup.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-[1.3fr_0.95fr]">
          <FileUpload />

          <section className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/90 p-8">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Live backend status</p>
              <div
                className="mt-4 rounded-3xl bg-slate-950/90 p-4 text-left shadow-inner shadow-slate-950/20 cursor-pointer hover:bg-slate-900 transition"
                onClick={checkApiStatus}
              >
                <p className="text-slate-300">API health check</p>
                <p
                  className={`mt-2 text-2xl font-semibold ${
                    apiStatus === 'ready'
                      ? 'text-emerald-400'
                      : apiStatus === 'offline'
                      ? 'text-red-400'
                      : 'text-slate-100'
                  }`}
                >
                  {apiStatus === 'ready' ? 'Ready' : apiStatus === 'offline' ? 'Offline' : 'Check'}
                </p>
              </div>
            </div>
            <div className="space-y-3 rounded-3xl bg-slate-950/90 p-4">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Core features</p>
              <ul className="space-y-3 text-slate-400">
                <li>✓ Upload files instantly</li>
                <li>✓ Generate share links</li>
                <li>✓ Live upload progress</li>
                <li>• Password protection</li>
              </ul>
            </div>
          </section>
        </div>

        <DownloadNotificationToast />
      </div>
    </main>
  );
}
