'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/lib/api';
import { useSocket } from '@/sockets/socketContext';

const expirationOptions = [
  { value: 60, label: '1 hour', description: 'Automatic deletion in 1 hour' },
  { value: 1440, label: '24 hours', description: 'Automatic deletion in 24 hours' },
  { value: 10080, label: '7 days', description: 'Automatic deletion in 7 days' },
  { value: 43200, label: '30 days', description: 'Automatic deletion in 30 days' },
];

// Skeleton Loader Component
function UploadSkeleton() {
  return (
    <div className="h-72 rounded-3xl border-2 border-slate-700 p-6 text-center">
      <div className="mt-10 flex h-full flex-col items-center justify-center gap-3">
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700/30"
        >
          ⇪
        </motion.div>
        <div className="h-6 w-48 rounded bg-slate-700/30" />
        <div className="h-4 w-32 rounded bg-slate-700/30" />
      </div>
    </div>
  );
}

function UploadCardSkeleton() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-3xl bg-slate-900/80 p-8 shadow-[0_0_60px_rgba(15,23,42,0.4)] backdrop-blur"
    >
      <div className="space-y-6 animate-pulse">
        <div className="rounded-3xl border border-slate-700/50 bg-slate-950/50 p-6">
          <UploadSkeleton />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 rounded-3xl bg-slate-950/50 border border-slate-700/50" />
          <div className="h-24 rounded-3xl bg-slate-950/50 border border-slate-700/50" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-40 rounded bg-slate-700/30" />
          <div className="h-4 rounded bg-slate-700/30" />
          <div className="h-12 rounded-full bg-slate-700/30" />
        </div>
      </div>
    </motion.section>
  );
}

// Format expiration time for display
function formatExpirationTime(expiresAt) {
  if (!expiresAt) return 'Unknown';

  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires - now;

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default function FileUpload({ onUploadSuccess }) {
  const { socket } = useSocket();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [shareUrls, setShareUrls] = useState([]);
  const [selectedExpiration, setSelectedExpiration] = useState(60);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(Array.from(files).slice(0, 10));
    }
  };

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileSelect(Array.from(files).slice(0, 10));
    }
  };

  const handleFileSelect = async (files) => {
    const selectedFiles = Array.isArray(files) ? files : [files];
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setShareUrls([]);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));
      formData.append('expirationMinutes', selectedExpiration);
      if (isPasswordProtected && password.trim()) {
        formData.append('password', password.trim());
      }

      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setUploadedFiles(response.data.files || []);
      onUploadSuccess?.(response.data);

      if (socket && Array.isArray(response.data.files)) {
        response.data.files.forEach((file) => {
          socket.emit('registerUploader', file.fileId);
          console.log('[Socket] Registered as uploader for file:', file.fileId);
        });
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!uploadedFiles.length || typeof window === 'undefined') return;
    setShareUrls(
      uploadedFiles.map((file) => `${window.location.origin}${file.shareLink}`)
    );
  }, [uploadedFiles]);

  if (isUploading) {
    return <UploadCardSkeleton />;
  }

  if (uploadedFiles.length > 0) {
    const firstFile = uploadedFiles[0];
    const firstShareUrl = shareUrls[0] || '';

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="space-y-6"
        role="alert"
        aria-live="polite"
      >
        <div className="rounded-3xl bg-slate-900/80 p-8 backdrop-blur shadow-2xl shadow-sky-900/20 border border-slate-700/50">
          <div className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 mx-auto text-emerald-400"
            >
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-semibold text-slate-100"
            >
              Upload successful!
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-slate-400"
            >
              {uploadedFiles.length === 1
                ? 'Your file is ready to share'
                : `${uploadedFiles.length} files are ready to share`}
            </motion.p>
          </div>

          <div className="mt-8 grid gap-4 rounded-3xl bg-slate-950/70 p-4 md:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <p className="text-sm text-slate-500">UPLOADED FILES</p>
              <div className="space-y-2 text-slate-100 font-medium">
                {uploadedFiles.map((file) => (
                  <div key={file.fileId} className="rounded-2xl bg-slate-900/80 p-3">
                    <p>{file.fileName}</p>
                    <p className="text-xs text-slate-500">{(file.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-500">QR SHARE CODE</p>
              {firstShareUrl ? (
                <div className="flex items-center justify-center rounded-2xl bg-slate-900 p-3">
                  <QRCodeSVG value={firstShareUrl} size={140} fgColor="#7dd3fc" bgColor="transparent" />
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-900 p-6 text-center text-slate-500">
                  Generating QR code...
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-3xl bg-slate-950/70 p-4 space-y-3">
            {uploadedFiles.map((file, index) => (
              <div key={file.fileId} className="space-y-2 rounded-2xl bg-slate-900/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">SHARE LINK</p>
                    <p className="text-slate-300 truncate">{shareUrls[index]}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (shareUrls[index]) {
                        navigator.clipboard.writeText(shareUrls[index]);
                        alert('Link copied to clipboard!');
                      }
                    }}
                    className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 transition"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-slate-500">Expires in {formatExpirationTime(file.expiresAt)}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              setUploadedFiles([]);
              setUploadProgress(0);
            }}
            className="mt-6 w-full rounded-full bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            Upload more files
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl bg-slate-900/80 p-8 shadow-[0_0_60px_rgba(15,23,42,0.4)] backdrop-blur"
      aria-label="File upload section"
    >
      <div className="space-y-4">
        <motion.div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          animate={{
            backgroundColor: isDragging ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.5)',
            borderColor: isDragging ? 'rgb(14, 165, 233)' : 'rgb(51, 65, 85)',
            scale: isUploading ? 1.02 : 1,
          }}
          whileHover={{
            scale: isUploading ? 1.02 : 1.01,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className={`h-72 rounded-3xl border-2 p-6 text-center cursor-pointer transition ${
            isUploading ? 'border-sky-500 bg-sky-900/10' : 'border-slate-700'
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          {isUploading ? (
            <UploadSkeleton />
          ) : (
            <div className="mt-10 flex h-full flex-col items-center justify-center gap-3">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full transition ${
                  isDragging
                    ? 'bg-sky-500/30 text-sky-300'
                    : 'bg-sky-500/10 text-sky-300'
                }`}
              >
                ⇪
              </div>
              <p className="text-lg font-medium text-slate-300">
                Drag files here or click to upload
              </p>
              <p className="text-sm text-slate-500">Max 500MB per file</p>
            </div>
          )}
        </motion.div>

        {/* Expiration Selector */}
        <div className="rounded-2xl bg-slate-950/50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Auto-delete after
          </p>
          <div className="grid grid-cols-2 gap-3">
            {expirationOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedExpiration(option.value)}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                  selectedExpiration === option.value
                    ? 'border-sky-500/50 bg-sky-500/10 text-sky-100'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 text-slate-300'
                }`}
              >
                <span
                  className={`text-sm font-semibold ${
                    selectedExpiration === option.value ? 'text-sky-400' : 'text-slate-300'
                  }`}
                >
                  {option.label}
                </span>
                <span className="text-xs text-slate-500">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Password Protection Toggle */}
        {isPasswordProtected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-slate-950/50 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Password
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to protect file"
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
              />
              <p className="mt-2 text-xs text-slate-500">
                Files protected with password require verification before download.
              </p>
            </div>
          </motion.div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
            aria-label="Select files to upload"
          >
            Select files
          </button>

          <button
            type="button"
            onClick={() => setIsPasswordProtected((prev) => !prev)}
            className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
              isPasswordProtected
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-slate-900/50 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {isPasswordProtected ? 'Password Protection ON' : 'Add Password Protection'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Accessible live region for upload progress */}
        <div aria-live="polite" className="sr-only">
          {isUploading ? `Uploading: ${uploadProgress}%` : ''}
        </div>
      </div>
    </motion.section>
  );
}
