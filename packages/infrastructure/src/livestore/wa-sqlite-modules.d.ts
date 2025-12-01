declare module '@livestore/wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js' {
  export class OriginPrivateFileSystemVFS {
    name: string;
    close(): Promise<void>;
  }
}

declare module '@livestore/wa-sqlite/src/examples/MemoryVFS.js' {
  export class MemoryVFS {
    name: string;
    static create(name: string, module: unknown): Promise<MemoryVFS>;
  }
}

declare module '@livestore/wa-sqlite/src/examples/IDBMirrorVFS.js' {
  export class IDBMirrorVFS {
    name: string;
    static create(
      name: string,
      module: unknown,
      options?: Record<string, unknown>
    ): Promise<IDBMirrorVFS>;
    close(): Promise<void>;
  }
}

declare module '@livestore/wa-sqlite/src/examples/AccessHandlePoolVFS.js' {
  export class AccessHandlePoolVFS {
    name: string;
    static create(name: string, module: unknown): Promise<unknown>;
    close?: () => Promise<void> | void;
  }
}
