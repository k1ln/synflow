declare module 'events' {
  class EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    emit(event: string | symbol, ...args: any[]): boolean;
  }
  export { EventEmitter };
  export default EventEmitter;
}

declare module 'naudiodon' {
  const naudiodon: any;
  export default naudiodon;
}

declare module 'wrtc' {
  const wrtc: any;
  export default wrtc;
}

declare const Buffer: any;
type Buffer = any;
type RTCPeerConnection = any;
type MediaStreamTrack = any;

declare module 'crypto' {
  export function randomUUID(): string;
}

declare module 'express' {
  const exp: any;
  export default exp;
}

declare module 'cors' {
  const cors: any;
  export default cors;
}

declare module 'path' {
  const path: any;
  export default path;
}

declare module 'url' {
  export function fileURLToPath(url: string): string;
}

declare const process: any;
