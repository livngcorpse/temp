'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [downloadNotifications, setDownloadNotifications] = useState([]);
  const [viewerCounts, setViewerCounts] = useState({});
  const [expirationData, setExpirationData] = useState({});

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace('http://', 'http://').replace('/api', '')
      : 'http://localhost:4000';

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket] Connected:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket] Disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });

    // Listen for upload progress events from server
    newSocket.on('uploadProgress', (data) => {
      console.log('[Socket] Upload progress:', data);
    });

    // Listen for file uploaded events from server
    newSocket.on('fileUploaded', (data) => {
      console.log('[Socket] File uploaded:', data);
    });

    // Listen for download notifications (Phase 7)
    newSocket.on('downloadNotification', (data) => {
      console.log('[Socket] Download notification:', data);
      setDownloadNotifications((prev) => [
        {
          id: Date.now(),
          fileId: data.fileId,
          fileName: data.fileName,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 4), // Keep last 5 notifications
      ]);
    });

    // Listen for viewer count updates (Phase 8)
    newSocket.on('viewerCountUpdate', (data) => {
      console.log('[Socket] Viewer count update:', data);
      setViewerCounts((prev) => ({ ...prev, [data.fileId]: data.count }));
    });

    // Listen for expiration updates (Phase 9)
    newSocket.on('expirationUpdate', (data) => {
      console.log('[Socket] Expiration update:', data);
      setExpirationData((prev) => ({
        ...prev,
        [data.fileId]: {
          timeRemaining: data.timeRemaining,
          isExpired: data.isExpired,
          formattedTime: data.formattedTime,
        },
      }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Register as uploader for a file
  const registerUploader = useCallback((fileId) => {
    socket?.emit('registerUploader', fileId);
  }, [socket]);

  // Join file viewer room
  const joinFileRoom = useCallback((fileId) => {
    socket?.emit('joinFile', fileId);
  }, [socket]);

  // Leave file viewer room
  const leaveFileRoom = useCallback((fileId) => {
    socket?.emit('leaveFile', fileId);
    // Clear expiration data when leaving file room
    setExpirationData((prev) => {
      const newData = { ...prev };
      delete newData[fileId];
      return newData;
    });
  }, [socket]);

  // Clear download notifications
  const clearDownloadNotifications = useCallback(() => {
    setDownloadNotifications([]);
  }, []);

  // Get viewer count for a file
  const getViewerCount = useCallback((fileId) => {
    return viewerCounts[fileId] || 0;
  }, [viewerCounts]);

  // Get expiration data for a file
  const getExpirationData = useCallback((fileId) => {
    return expirationData[fileId] || null;
  }, [expirationData]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        downloadNotifications,
        viewerCounts,
        expirationData,
        registerUploader,
        joinFileRoom,
        leaveFileRoom,
        clearDownloadNotifications,
        getViewerCount,
        getExpirationData,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
