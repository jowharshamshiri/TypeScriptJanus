declare module 'unix-dgram' {
  import { EventEmitter } from 'events';

  interface Socket extends EventEmitter {
    bind(path: string): void;
    send(buffer: Buffer, offset: number, length: number, path: string, callback?: (error: Error | null) => void): void;
    close(): void;
    on(event: 'message', listener: (msg: Buffer, rinfo: any) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  export function createSocket(type: 'unix_dgram'): Socket;
}