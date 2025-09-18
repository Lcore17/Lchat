import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import io, { Socket } from "socket.io-client";

import { useAuth } from "./AuthContext"; // Your AuthContext import

// Make sure this is set to your computer's local IP, not localhost.

const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL || "http://192.168.0.35:5000"; // Replace with your IP

interface SocketContextType {
  socket: Socket | null;

  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  const [isConnected, setIsConnected] = useState(false);

  const { user } = useAuth();
  // Only reconnect socket if user ID changes (not on every user update)
  const [lastUserId, setLastUserId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.id && user.id !== lastUserId) {
      // New login or user ID changed
      setLastUserId(user.id);
      const newSocket = io(SOCKET_URL, {
        query: { userId: user.id },
        transports: ["websocket"],
        reconnection: true,
      });
      newSocket.on("connect", () => {
        console.log(`✅ Socket connected successfully for user: ${user.id}`);
        setIsConnected(true);
      });
      newSocket.on("disconnect", (reason) => {
        console.log(`🔌 Socket disconnected:`, reason);
        setIsConnected(false);
      });
      newSocket.on("connect_error", (error) => {
        console.error("❌ Socket connection error:", error);
        setIsConnected(false);
      });
      setSocket(newSocket);
      return () => {
        console.log("Cleaning up socket connection...");
        newSocket.disconnect();
      };
    } else if (!user || !user.id) {
      // User logged out
      setLastUserId(null);
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
    }
    // Do NOT reconnect socket on other user property changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);

  if (context === undefined) {
    throw new Error("useSocket must be used within a SocketProvider");
  }

  return context;
};
