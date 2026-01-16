/**
 * LinkSocks Local Provider
 * 
 * This module provides a WebSocket-based network provider that connects to
 * a LinkSocks relay server and handles TCP/UDP proxy requests.
 */

import WebSocket from "ws";
import * as net from "net";
import * as dgram from "dgram";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  type AuthResponseMessage,
  type ConnectMessage,
  type ConnectResponseMessage,
  type ConnectorMessage,
  type ConnectorResponseMessage,
  type DataMessage,
  type DisconnectMessage,
  type LogMessage,
  type PartnersMessage,
  parseMessage,
  packMessage,
  MessageType,
  DataCompression,
} from "./message";

export interface ProviderOptions {
  /** Remote relay server URL (e.g., wss://linksocks.example.com) */
  serverUrl: string;
  /** Provider token for authentication */
  token: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Disable all logging output */
  silent?: boolean;
  /** Reconnect interval in milliseconds */
  reconnectInterval?: number;
  /** Maximum reconnect attempts (0 = infinite) */
  maxReconnectAttempts?: number;
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Upstream proxy (optional, format: host:port) */
  upstreamProxy?: string;
  /** Upstream proxy type */
  upstreamProxyType?: "socks5" | "http";
  /** Upstream proxy username */
  upstreamUsername?: string;
  /** Upstream proxy password */
  upstreamPassword?: string;
}

interface TCPChannel {
  socket: net.Socket;
  channelId: string;
}

interface UDPChannel {
  socket: dgram.Socket;
  channelId: string;
  clientAddr?: string;
  clientPort?: number;
}

type LogLevel = "debug" | "info" | "warn" | "error";

// Helper to convert Buffer to Uint8Array
function toUint8Array(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export class LocalProvider {
  private options: Required<ProviderOptions>;
  private ws: WebSocket | null = null;
  private instanceId: string;
  private tcpChannels: Map<string, TCPChannel> = new Map();
  private udpChannels: Map<string, UDPChannel> = new Map();
  private reconnectAttempts = 0;
  private isClosing = false;
  private partnersCount = 0;
  private connectorTokens: Set<string> = new Set();

  constructor(options: ProviderOptions) {
    this.options = {
      serverUrl: options.serverUrl,
      token: options.token,
      debug: options.debug ?? false,
      silent: options.silent ?? false,
      reconnectInterval: options.reconnectInterval ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 0,
      connectTimeout: options.connectTimeout ?? 10000,
      upstreamProxy: options.upstreamProxy ?? "",
      upstreamProxyType: options.upstreamProxyType ?? "socks5",
      upstreamUsername: options.upstreamUsername ?? "",
      upstreamPassword: options.upstreamPassword ?? "",
    };
    this.instanceId = uuidv4();
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    // Skip all logging if silent mode is enabled
    if (this.options.silent) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (level === "debug" && !this.options.debug) {
      return;
    }

    switch (level) {
      case "debug":
        console.debug(prefix, message, ...args);
        break;
      case "info":
        console.info(prefix, message, ...args);
        break;
      case "warn":
        console.warn(prefix, message, ...args);
        break;
      case "error":
        console.error(prefix, message, ...args);
        break;
    }
  }

  /**
   * Connect to the remote relay server as a provider
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.close();
      }

      const url = this.buildWebSocketUrl();
      this.log("info", `Connecting to ${url}`);

      this.ws = new WebSocket(url);
      this.ws.binaryType = "arraybuffer";

      const timeout = setTimeout(() => {
        if (this.ws) {
          this.ws.close();
        }
        reject(new Error("Connection timeout"));
      }, this.options.connectTimeout);

      this.ws.on("open", () => {
        this.log("info", "WebSocket connection established");
        this.reconnectAttempts = 0;
      });

      this.ws.on("message", (data: Buffer | ArrayBuffer) => {
        try {
          const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
          const msg = parseMessage(buffer);
          this.handleMessage(msg, resolve, reject, timeout);
        } catch (err) {
          this.log("error", "Failed to parse message:", err);
        }
      });

      this.ws.on("close", (code, reason) => {
        clearTimeout(timeout);
        this.log("info", `WebSocket closed: ${code} - ${reason.toString()}`);
        this.handleDisconnect();
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        this.log("error", "WebSocket error:", err);
        reject(err);
      });
    });
  }

  private buildWebSocketUrl(): string {
    const base = this.options.serverUrl.replace(/\/$/, "");
    const tokenHash = this.sha256Sync(this.options.token);
    
    // Check if URL already contains a path (tunnel mode via /linksocks/{uuid})
    // In tunnel mode, the URL is already complete, just append query params
    // In direct mode, we need to append /socket path
    const url = new URL(base);
    const hasTunnelPath = url.pathname && url.pathname !== "/" && url.pathname.length > 1;
    
    if (hasTunnelPath) {
      // Tunnel mode: URL already has path like /linksocks/{uuid}
      // Just append query parameters
      const separator = base.includes("?") ? "&" : "?";
      return `${base}${separator}token=${tokenHash}&reverse=true`;
    } else {
      // Direct mode: append /socket path and query parameters
      return `${base}/socket?token=${tokenHash}&reverse=true`;
    }
  }

  private sha256Sync(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  private handleMessage(
    msg: ReturnType<typeof parseMessage>,
    resolve?: (value: void) => void,
    reject?: (reason: Error) => void,
    timeout?: NodeJS.Timeout
  ): void {
    switch (msg.getType()) {
      case MessageType.AuthResponse:
        this.handleAuthResponse(msg as AuthResponseMessage, resolve, reject, timeout);
        break;
      case MessageType.Connect:
        this.handleConnect(msg as ConnectMessage);
        break;
      case MessageType.Data:
        this.handleData(msg as DataMessage);
        break;
      case MessageType.Disconnect:
        this.handleDisconnectMessage(msg as DisconnectMessage);
        break;
      case MessageType.ConnectorResponse:
        this.handleConnectorResponse(msg as ConnectorResponseMessage);
        break;
      case MessageType.Log:
        this.handleLog(msg as LogMessage);
        break;
      case MessageType.Partners:
        this.handlePartners(msg as PartnersMessage);
        break;
      default:
        this.log("debug", "Unknown message type:", msg.getType());
    }
  }

  private handleAuthResponse(
    msg: AuthResponseMessage,
    resolve?: (value: void) => void,
    reject?: (reason: Error) => void,
    timeout?: NodeJS.Timeout
  ): void {
    if (timeout) clearTimeout(timeout);

    if (msg.success) {
      this.log("info", "Authentication successful");
      resolve?.();
    } else {
      const error = new Error(`Authentication failed: ${msg.error || "Unknown error"}`);
      this.log("error", error.message);
      reject?.(error);
    }
  }

  private handleConnect(msg: ConnectMessage): void {
    const { protocol, channelId, address, port } = msg;
    this.log("debug", `Connect request: ${protocol} ${address}:${port} (channel: ${channelId})`);

    if (protocol === "tcp") {
      this.handleTCPConnect(channelId, address!, port!);
    } else if (protocol === "udp") {
      this.handleUDPConnect(channelId);
    }
  }

  private handleTCPConnect(channelId: string, address: string, port: number): void {
    const socket = new net.Socket();

    socket.on("connect", () => {
      this.log("debug", `TCP connected to ${address}:${port}`);
      this.tcpChannels.set(channelId, { socket, channelId });
      this.sendConnectResponse(channelId, true);
    });

    socket.on("data", (data) => {
      this.sendData(channelId, "tcp", data);
    });

    socket.on("close", () => {
      this.log("debug", `TCP connection closed: ${channelId}`);
      this.tcpChannels.delete(channelId);
      this.sendDisconnect(channelId);
    });

    socket.on("error", (err) => {
      this.log("error", `TCP error for ${channelId}:`, err.message);
      this.tcpChannels.delete(channelId);
      this.sendConnectResponse(channelId, false, err.message);
    });

    // Connect with optional upstream proxy
    if (this.options.upstreamProxy) {
      this.connectViaProxy(socket, address, port, channelId);
    } else {
      socket.connect(port, address);
    }
  }

  private connectViaProxy(
    socket: net.Socket,
    address: string,
    port: number,
    channelId: string
  ): void {
    const [proxyHost, proxyPortStr] = this.options.upstreamProxy.split(":");
    const proxyPort = parseInt(proxyPortStr, 10);

    if (this.options.upstreamProxyType === "socks5") {
      // SOCKS5 proxy connection
      socket.connect(proxyPort, proxyHost, () => {
        // SOCKS5 handshake
        const authMethods = this.options.upstreamUsername ? [0x00, 0x02] : [0x00];
        socket.write(new Uint8Array([0x05, authMethods.length, ...authMethods]));
      });

      let handshakeState = 0;
      const originalDataHandler = socket.listeners("data")[0] as (data: Buffer) => void;

      const proxyHandler = (data: Buffer) => {
        if (handshakeState === 0) {
          // Method selection response
          if (data[0] !== 0x05) {
            socket.destroy(new Error("Invalid SOCKS5 response"));
            return;
          }
          if (data[1] === 0x02 && this.options.upstreamUsername) {
            // Username/password auth
            const username = new TextEncoder().encode(this.options.upstreamUsername);
            const password = new TextEncoder().encode(this.options.upstreamPassword);
            const authPacket = new Uint8Array(3 + username.length + password.length);
            authPacket[0] = 0x01;
            authPacket[1] = username.length;
            authPacket.set(username, 2);
            authPacket[2 + username.length] = password.length;
            authPacket.set(password, 3 + username.length);
            socket.write(authPacket);
            handshakeState = 1;
          } else if (data[1] === 0x00) {
            // No auth needed, send connect request
            this.sendSocks5ConnectRequest(socket, address, port);
            handshakeState = 2;
          } else {
            socket.destroy(new Error("SOCKS5 auth method not supported"));
          }
        } else if (handshakeState === 1) {
          // Auth response
          if (data[1] !== 0x00) {
            socket.destroy(new Error("SOCKS5 authentication failed"));
            return;
          }
          this.sendSocks5ConnectRequest(socket, address, port);
          handshakeState = 2;
        } else if (handshakeState === 2) {
          // Connect response
          if (data[0] !== 0x05 || data[1] !== 0x00) {
            socket.destroy(new Error(`SOCKS5 connect failed: ${data[1]}`));
            return;
          }
          // Connection established, remove proxy handler
          socket.removeListener("data", proxyHandler);
          if (originalDataHandler) {
            socket.on("data", originalDataHandler);
          }
          this.tcpChannels.set(channelId, { socket, channelId });
          this.sendConnectResponse(channelId, true);
        }
      };

      socket.removeAllListeners("data");
      socket.on("data", proxyHandler);
    } else {
      // HTTP CONNECT proxy
      socket.connect(proxyPort, proxyHost, () => {
        let connectRequest = `CONNECT ${address}:${port} HTTP/1.1\r\nHost: ${address}:${port}\r\n`;
        if (this.options.upstreamUsername) {
          const auth = Buffer.from(
            `${this.options.upstreamUsername}:${this.options.upstreamPassword}`
          ).toString("base64");
          connectRequest += `Proxy-Authorization: Basic ${auth}\r\n`;
        }
        connectRequest += "\r\n";
        socket.write(connectRequest);
      });

      const originalDataHandler = socket.listeners("data")[0] as (data: Buffer) => void;
      let responseBuffer = "";

      const proxyHandler = (data: Buffer) => {
        responseBuffer += data.toString();
        if (responseBuffer.includes("\r\n\r\n")) {
          const statusLine = responseBuffer.split("\r\n")[0];
          if (statusLine.includes("200")) {
            socket.removeListener("data", proxyHandler);
            if (originalDataHandler) {
              socket.on("data", originalDataHandler);
            }
            this.tcpChannels.set(channelId, { socket, channelId });
            this.sendConnectResponse(channelId, true);
          } else {
            socket.destroy(new Error(`HTTP proxy connect failed: ${statusLine}`));
          }
        }
      };

      socket.removeAllListeners("data");
      socket.on("data", proxyHandler);
    }
  }

  private sendSocks5ConnectRequest(socket: net.Socket, address: string, port: number): void {
    const addressBytes = new TextEncoder().encode(address);
    const packet = new Uint8Array(7 + addressBytes.length);
    packet[0] = 0x05; // Version
    packet[1] = 0x01; // Connect command
    packet[2] = 0x00; // Reserved
    packet[3] = 0x03; // Domain name
    packet[4] = addressBytes.length;
    packet.set(addressBytes, 5);
    packet[5 + addressBytes.length] = (port >> 8) & 0xff;
    packet[6 + addressBytes.length] = port & 0xff;
    socket.write(packet);
  }

  private handleUDPConnect(channelId: string): void {
    const socket = dgram.createSocket("udp4");

    socket.on("message", (data, rinfo) => {
      this.sendData(channelId, "udp", data, rinfo.address, rinfo.port);
    });

    socket.on("error", (err) => {
      this.log("error", `UDP error for ${channelId}:`, err.message);
      this.udpChannels.delete(channelId);
    });

    socket.on("close", () => {
      this.udpChannels.delete(channelId);
    });

    socket.bind(() => {
      this.udpChannels.set(channelId, { socket, channelId });
      this.sendConnectResponse(channelId, true);
    });
  }

  private handleData(msg: DataMessage): void {
    const { protocol, channelId, data, targetAddr, targetPort, address, port } = msg;

    if (protocol === "tcp") {
      const channel = this.tcpChannels.get(channelId);
      if (channel) {
        channel.socket.write(new Uint8Array(data));
      }
    } else if (protocol === "udp") {
      const channel = this.udpChannels.get(channelId);
      if (channel && targetAddr && targetPort) {
        channel.socket.send(new Uint8Array(data), targetPort, targetAddr);
        // Store client address for responses
        if (address && port) {
          channel.clientAddr = address;
          channel.clientPort = port;
        }
      }
    }
  }

  private handleDisconnectMessage(msg: DisconnectMessage): void {
    const { channelId } = msg;
    this.log("debug", `Disconnect request: ${channelId}`);

    const tcpChannel = this.tcpChannels.get(channelId);
    if (tcpChannel) {
      tcpChannel.socket.destroy();
      this.tcpChannels.delete(channelId);
    }

    const udpChannel = this.udpChannels.get(channelId);
    if (udpChannel) {
      udpChannel.socket.close();
      this.udpChannels.delete(channelId);
    }
  }

  private handleConnectorResponse(msg: ConnectorResponseMessage): void {
    if (msg.success && msg.connectorToken) {
      this.connectorTokens.add(msg.connectorToken);
      this.log("info", `Connector token registered: ${msg.connectorToken}`);
    } else if (!msg.success) {
      this.log("error", `Connector registration failed: ${msg.error}`);
    }
  }

  private handleLog(msg: LogMessage): void {
    this.log(msg.level as LogLevel, `[Server] ${msg.msg}`);
  }

  private handlePartners(msg: PartnersMessage): void {
    this.partnersCount = msg.count;
    this.log("info", `Connected connectors: ${msg.count}`);
  }

  private sendConnectResponse(channelId: string, success: boolean, error?: string): void {
    const msg: ConnectResponseMessage = {
      success,
      channelId,
      error,
      getType: () => MessageType.ConnectResponse,
    };
    this.send(packMessage(msg));
  }

  private sendData(
    channelId: string,
    protocol: string,
    data: Buffer | Uint8Array,
    address?: string,
    port?: number
  ): void {
    const msg: DataMessage = {
      protocol,
      channelId,
      data: toUint8Array(Buffer.isBuffer(data) ? data : Buffer.from(data)),
      compression: DataCompression.None,
      address,
      port,
      getType: () => MessageType.Data,
    };
    this.send(packMessage(msg));
  }

  private sendDisconnect(channelId: string): void {
    const msg: DisconnectMessage = {
      channelId,
      getType: () => MessageType.Disconnect,
    };
    this.send(packMessage(msg));
  }

  private send(data: Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  /**
   * Register a connector token for this provider
   */
  addConnectorToken(token?: string): void {
    const channelId = uuidv4();
    const msg: ConnectorMessage = {
      channelId,
      connectorToken: token || "",
      operation: "add",
      getType: () => MessageType.Connector,
    };
    this.send(packMessage(msg));
  }

  /**
   * Remove a connector token
   */
  removeConnectorToken(token: string): void {
    const channelId = uuidv4();
    const msg: ConnectorMessage = {
      channelId,
      connectorToken: token,
      operation: "remove",
      getType: () => MessageType.Connector,
    };
    this.send(packMessage(msg));
    this.connectorTokens.delete(token);
  }

  private handleDisconnect(): void {
    // Clean up all channels
    for (const [, channel] of this.tcpChannels) {
      channel.socket.destroy();
    }
    this.tcpChannels.clear();

    for (const [, channel] of this.udpChannels) {
      channel.socket.close();
    }
    this.udpChannels.clear();

    // Attempt reconnection if not closing
    if (!this.isClosing) {
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (
      this.options.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.options.maxReconnectAttempts
    ) {
      this.log("error", "Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    this.log(
      "info",
      `Reconnecting in ${this.options.reconnectInterval}ms (attempt ${this.reconnectAttempts})`
    );

    setTimeout(async () => {
      try {
        await this.connect();
        // Re-register connector tokens after reconnection
        for (const token of this.connectorTokens) {
          this.addConnectorToken(token);
        }
      } catch (err) {
        this.log("error", "Reconnection failed:", err);
      }
    }, this.options.reconnectInterval);
  }

  /**
   * Close the provider connection
   */
  close(): void {
    this.isClosing = true;

    // Clean up all channels
    for (const [, channel] of this.tcpChannels) {
      channel.socket.destroy();
    }
    this.tcpChannels.clear();

    for (const [, channel] of this.udpChannels) {
      channel.socket.close();
    }
    this.udpChannels.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.log("info", "Provider closed");
  }

  /**
   * Get the number of connected connectors
   */
  getPartnersCount(): number {
    return this.partnersCount;
  }

  /**
   * Get registered connector tokens
   */
  getConnectorTokens(): string[] {
    return Array.from(this.connectorTokens);
  }

  /**
   * Check if connected to the relay server
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
