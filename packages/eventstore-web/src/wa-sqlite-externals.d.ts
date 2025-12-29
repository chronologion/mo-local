declare module 'wa-sqlite/src/examples/AccessHandlePoolVFS.js' {
  export class AccessHandlePoolVFS implements SQLiteVFS {
    constructor(directoryPath: string);
    readonly name: string;
    readonly isReady: Promise<void>;
    close(): Promise<void>;
    xClose(fileId: number): number;
    xRead(fileId: number, pData: Uint8Array, iOffset: number): number;
    xWrite(fileId: number, pData: Uint8Array, iOffset: number): number;
    xTruncate(fileId: number, iSize: number): number;
    xSync(fileId: number, flags: number): number;
    xFileSize(fileId: number, pSize64: DataView): number;
    xLock(fileId: number, flags: number): number;
    xUnlock(fileId: number, flags: number): number;
    xCheckReservedLock(fileId: number, pResOut: DataView): number;
    xFileControl(fileId: number, flags: number, pOut: DataView): number;
    xDeviceCharacteristics(fileId: number): number;
    xOpen(
      name: string | null,
      fileId: number,
      flags: number,
      pOutFlags: DataView
    ): number;
    xDelete(name: string, syncDir: number): number;
    xAccess(name: string, flags: number, pResOut: DataView): number;
  }
}

declare module 'wa-sqlite/src/examples/MemoryVFS.js' {
  export class MemoryVFS implements SQLiteVFS {
    constructor();
    readonly name: string;
    close(): void;
    xClose(fileId: number): number;
    xRead(fileId: number, pData: Uint8Array, iOffset: number): number;
    xWrite(fileId: number, pData: Uint8Array, iOffset: number): number;
    xTruncate(fileId: number, iSize: number): number;
    xSync(fileId: number, flags: number): number;
    xFileSize(fileId: number, pSize64: DataView): number;
    xLock(fileId: number, flags: number): number;
    xUnlock(fileId: number, flags: number): number;
    xCheckReservedLock(fileId: number, pResOut: DataView): number;
    xFileControl(fileId: number, flags: number, pOut: DataView): number;
    xDeviceCharacteristics(fileId: number): number;
    xOpen(
      name: string | null,
      fileId: number,
      flags: number,
      pOutFlags: DataView
    ): number;
    xDelete(name: string, syncDir: number): number;
    xAccess(name: string, flags: number, pResOut: DataView): number;
  }
}
