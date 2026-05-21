'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/lib/api';
import { useSocket } from '@/sockets/socketContext';

function FilePageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="mx-auto max-w-5xl animate-pulse space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="h-8 w-48 rounded-full bg-slate-800" />
          <div className="h-8 w-24 rounded-full bg-slate-800" />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-[360px] rounded-3xl bg-slate-900/80 border border-slate-800" />
            <div className="h-40 rounded-3xl bg-slate-900/80 border border-slate-800" />
            <div className="h-64 rounded-3xl bg-slate-900/80 border border-slate-800" />
          </div>

          <div className="space-y-6">
            <div className="h-80 rounded-3xl bg-slate-900/80 border border-slate-800" />
            <div className="h-56 rounded-3xl bg-slate-900/80 border border-slate-800" />
          </div>
        </div>
      </div>
    </div>
  );
}

function getFileTypeIcon(mimeType) {
  if (!mimeType) {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    );
  }

  if (mimeType.startsWith('image/')) {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a4 4 0 014-4h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l2 2 4-4 4 4" />
      </svg>
    );
  }

  if (mimeType === 'application/pdf') {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2h6a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h6z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v6h6" />
      </svg>
    );
  }

  if (mimeType.startsWith('video/')) {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h12v12H4z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l5 4-5 4V8z" />
      </svg>
    );
  }

  if (mimeType.startsWith('audio/')) {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18V5l12-2v13" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18a3 3 0 01-3-3 3 3 0 013-3" />
      </svg>
    );
  }

  if (mimeType.startsWith('text/')) {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h8M8 10h8M8 14h5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h12v16H6V4z" />
      </svg>
    );
  }

  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 2h9l5 5v15a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 2v5h5" />
    </svg>
  );
}

export default function FilePage({ params }) {
  const { id } = params;
  const { joinFileRoom, leaveFileRoom, getViewerCount, getExpirationData } = useSocket();
  const [fileData, setFileData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [expirationStatus, setExpirationStatus] = useState(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [serverExpiration, setServerExpiration] = useState(null);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    fetchFileDetails();
    fetchExpirationStatus();
    const expirationInterval = setInterval(fetchExpirationStatus, 60000); // Check every minute

    // Join socket room for viewer count
    joinFileRoom(id);

    return () => {
      clearInterval(expirationInterval);
      leaveFileRoom(id);
    };
  }, [id, joinFileRoom, leaveFileRoom]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShareUrl(`${window.location.origin}/f/${id}`);
  }, [id]);

  // Countdown effect for expiration timer
  useEffect(() => {
    if (timeRemaining == null) return;

    const countdown = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev == null) return null;
        const next = prev - 1000;
        if (next <= 0) {
          setExpirationStatus('expired');
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [timeRemaining]);

  // Listen for viewer count updates from socket context (Phase 8)
  useEffect(() => {
    setViewerCount(getViewerCount(id));
  }, [id, getViewerCount]);

  // Use server-provided expiration data for live countdown (Phase 9)
  useEffect(() => {
    const expirationData = getExpirationData(id);
    if (expirationData) {
      setServerExpiration(expirationData);
      if (expirationData.isExpired) {
        setTimeRemaining(0);
        setExpirationStatus('expired');
      } else {
        setTimeRemaining(expirationData.timeRemaining);
        setExpirationStatus('active');
      }
    }
  }, [id, getExpirationData]);

  // Helper to format a millisecond countdown into H:M:S or M:SS
  const formatCountdown = (ms) => {
    if (ms == null || ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${String(seconds).padStart(2, '0')}s`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  async function fetchFileDetails() {
    try {
      const response = await api.get(`/file/${id}`);
      setFileData(response.data);
      setPasswordProtected(response.data.passwordProtected || false);
    } catch (err) {
      if (err.response?.status === 410) {
        setError('File has expired');
      } else if (err.response?.status === 404) {
        setError('File not found');
      } else {
        setError('Failed to load file details');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchExpirationStatus() {
    try {
      const response = await api.get(`/file/${id}/check-expiration`);
      if (response.data.fileExists) {
        setTimeRemaining(response.data.timeRemaining);
        setExpirationStatus(response.data.isExpired ? 'expired' : 'active');
      }
    } catch (err) {
      console.error('Expiration check failed:', err);
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');

    try {
      const response = await api.post(`/download/${id}/verify-password`, { password });

      if (response.data.success) {
        setPasswordProtected(false);
        setIsAuthorized(true);
        setPassword('');
      }
    } catch (err) {
      setPasswordError('Incorrect password');
    }
  };

  const handleDownload = async () => {
    if (passwordProtected) return;

    setIsDownloading(true);
    try {
      const response = await api.get(`/download/${id}`, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileData?.originalName || 'file');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Download failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsDownloading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Prioritize server expiration data for live countdown (Phase 9)
  const getExpirationStatus = () => {
    if (expirationStatus === 'expired' || (timeRemaining != null && timeRemaining <= 0)) return 'expired';

    // Use server-provided formatted time (live updates from socket) when available
    if (serverExpiration?.formattedTime && serverExpiration.timeRemaining > 0) {
      return `expires in ${serverExpiration.formattedTime}`;
    }

    if (timeRemaining == null || timeRemaining <= 0) {
      // Fallback to fileData if countdown is not yet ready
      if (!fileData?.expirationTimestamp) return null;
      const expiresAt = new Date(fileData.expirationTimestamp);
      const now = new Date();
      const diff = expiresAt - now;

      if (diff <= 0) return 'expired';

      if (diff < 3600000) {
        const minutes = Math.ceil(diff / 60000);
        return `expires in ${minutes}m`;
      }
      if (diff < 86400000) {
        const hours = Math.ceil(diff / 3600000);
        return `expires in ${hours}h`;
      }
      const days = Math.ceil(diff / 86400000);
      return `expires in ${days}d`;
    }

    // Use countdown timer for live updates
    const totalSeconds = Math.floor(timeRemaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `expires in ${hours}h ${minutes}m`;
    }
    return `expires in ${minutes}m ${totalSeconds % 60}s`;
  };

  const getPreviewContent = () => {
    if (!fileData?.mimeType || !fileData.originalName) return null;

    const mimeType = fileData.mimeType;
    const fileName = fileData.originalName;

    // Image files
    if (mimeType.startsWith('image/')) {
      return (
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900">
          <img
            src={`/api/download/${id}`}
            alt={fileName}
            className="h-full w-full object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-center text-xs text-slate-300">
            Image preview
          </div>
        </div>
      );
    }

    // PDF files
    if (mimeType === 'application/pdf') {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-slate-900">
          <iframe
            src={`/api/download/${id}#toolbar=0&navpanes=0&scrollbar=0`}
            className="h-full w-full"
            title="PDF Preview"
          />
        </div>
      );
    }

    // Video files
    if (mimeType.startsWith('video/')) {
      return (
        <div className="w-full max-w-2xl">
          <video
            src={`/api/download/${id}`}
            controls
            className="w-full rounded-2xl"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <p className="mt-3 text-center text-sm text-slate-500">Video preview</p>
        </div>
      );
    }

    // Audio files
    if (mimeType.startsWith('audio/')) {
      return (
        <div className="w-full max-w-2xl">
          <audio
            src={`/api/download/${id}`}
            controls
            className="w-full"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <p className="mt-3 text-center text-sm text-slate-500">Audio preview</p>
        </div>
      );
    }

    // Text files
    if (mimeType.startsWith('text/')) {
      return (
        <div className="w-full max-w-3xl">
          <div className="rounded-2xl bg-slate-900 p-6 font-mono text-sm text-slate-300">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap">
              {`Text file preview\n\n[Click download to view full content]`}
            </pre>
          </div>
        </div>
      );
    }

    return null;
  };

  // Loading state
  if (isLoading) {
    return <FilePageSkeleton />;
  }

  // Error state
  if (error && !passwordProtected) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md text-center"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 text-red-500">
            <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold">File not available</h2>
          <p className="mt-2 text-slate-400">{error}</p>
          <Link
            href="/"
            className="mt-8 inline-block rounded-full bg-sky-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            Back to Home
          </Link>
        </motion.div>
      </div>
    );
  }

  // Password protected - show password form
  if (passwordProtected && !isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="rounded-3xl bg-slate-900 p-8 shadow-2xl shadow-black/50">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold">Password Required</h2>
            <p className="mt-2 text-slate-400">
              This file is protected with a password. Please enter the password to access it.
            </p>

            <form onSubmit={handlePasswordSubmit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Enter password"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-sm text-red-400">{passwordError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={!password}
                className="w-full rounded-full bg-sky-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Access File
              </button>
            </form>
            <Link
              href="/"
              className="mt-6 block text-center text-sm text-slate-500 hover:text-slate-300"
            >
              Cancel
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // File details page
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-400 transition hover:text-sky-400"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>Back to Home</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-400">
              ID: {id}
            </span>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left column: File info */}
          <div className="lg:col-span-2 space-y-6">
            {/* File preview or icon */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-3xl bg-slate-900/50 p-6 border border-slate-800"
            >
              {getPreviewContent() || (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl bg-slate-900/50">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-800/50 text-slate-500">
                    <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="mt-4 text-sm text-slate-500">File preview not available</p>
                </div>
              )}
            </motion.div>

            {/* Viewer Count Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-3xl bg-slate-900/50 p-6 border border-slate-800"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <svg className="h-4 w-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Live Viewer Count
                </h3>
                {viewerCount > 0 && (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                    Live
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-3xl font-semibold text-slate-100">{viewerCount}</p>
                    <p className="text-sm text-slate-500">currently viewing</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Live Expiration Countdown (Phase 9) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-3xl bg-gradient-to-br from-slate-900/50 to-slate-900/80 p-6 border border-slate-800"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Live Expiration Timer
                </h3>
                {expirationStatus !== 'expired' && (
                  <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-400 animate-pulse">
                    Live
                  </span>
                )}
              </div>
              <div className="mt-4">
                <div className={`text-4xl font-mono font-bold ${
                  getExpirationStatus() === 'expired'
                    ? 'text-red-500'
                    : 'text-purple-400'
                }`}>
                  {getExpirationStatus() === 'expired'
                    ? 'EXPIRED'
                    : (timeRemaining ? formatCountdown(timeRemaining) : (serverExpiration?.formattedTime || '--:--'))}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {expirationStatus === 'expired'
                    ? 'This file has expired and is no longer available.'
                    : 'This file will automatically delete when the timer expires.'}
                </p>
              </div>
            </motion.div>

            {/* File details */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-6"
            >
              <div className="rounded-3xl bg-slate-900/50 p-6 border border-slate-800">
                <h3 className="text-lg font-semibold text-slate-100">File Information</h3>

                <div className="mt-4 space-y-4">
                  <div className="flex items-start justify-between py-3 border-b border-slate-800/50">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-300">
                        {getFileTypeIcon(fileData?.mimeType)}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">File Name</p>
                        <p className="text-slate-200 font-medium break-all">{fileData?.originalName}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start justify-between py-3 border-b border-slate-800/50">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">File Size</p>
                      <p className="text-slate-200">{formatFileSize(fileData?.fileSize || 0)}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">MIME Type</p>
                      <p className="text-slate-200 text-sm">{fileData?.mimeType || 'application/octet-stream'}</p>
                    </div>
                  </div>

                  <div className="flex items-start justify-between py-3 border-b border-slate-800/50">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Uploaded</p>
                      <p className="text-slate-200">{formatDateTime(fileData?.uploadTimestamp || '')}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Downloads</p>
                      <p className="text-slate-200">{fileData?.downloadCount || 0} times</p>
                    </div>
                  </div>

                  <div className="flex items-start justify-between py-3 border-b border-slate-800/50">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Status</p>
                      <p className="text-slate-200">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          getExpirationStatus() === 'expired'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {getExpirationStatus() === 'expired' ? 'Expired' : 'Active'}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Expiration</p>
                      <p className={`text-sm ${
                        getExpirationStatus() === 'expired'
                          ? 'text-red-400'
                          : 'text-slate-200'
                      }`}>
                        {fileData?.expirationTimestamp ? formatDateTime(fileData.expirationTimestamp) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right column: Actions */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-3xl bg-slate-900/50 p-6 border border-slate-800"
            >
              <h3 className="text-lg font-semibold text-slate-100">Actions</h3>

              <div className="mt-6 space-y-4">
                <motion.button
                  onClick={handleDownload}
                  disabled={isDownloading || passwordProtected}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 px-6 py-4 font-semibold text-slate-950 transition hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="relative flex items-center justify-center gap-2">
                    {isDownloading ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        <span>Download File</span>
                      </>
                    )}
                  </div>
                </motion.button>

                <div className="rounded-2xl bg-slate-950/50 p-4 space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Share Link</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={shareUrl}
                        placeholder="Generating share URL..."
                        readOnly
                        className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-300"
                      />
                      <button
                        onClick={() => {
                          if (shareUrl) {
                            navigator.clipboard.writeText(shareUrl);
                            alert('Link copied to clipboard!');
                          }
                        }}
                        className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  {shareUrl && (
                    <div className="rounded-2xl bg-slate-900 p-4">
                      <p className="mb-3 text-xs uppercase tracking-[0.25em] text-slate-500">QR Code</p>
                      <div className="flex items-center justify-center">
                        <QRCodeSVG value={shareUrl} size={140} fgColor="#7dd3fc" bgColor="transparent" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Quick Info Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-3xl bg-gradient-to-br from-slate-900/50 to-slate-900/80 p-6 border border-slate-800"
            >
              <h4 className="text-sm font-semibold text-slate-300">Quick Info</h4>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500">Upload Speed</p>
                    <p className="text-sm font-medium text-slate-200">Fast</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500">Security</p>
                    <p className="text-sm font-medium text-slate-200">Encrypted</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
