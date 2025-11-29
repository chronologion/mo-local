export type ColumnType = 'text' | 'integer' | 'blob' | 'datetime';

export interface ColumnDefinition {
  readonly type: ColumnType;
  readonly primaryKey?: boolean;
  readonly nullable?: boolean;
  readonly defaultValue?: string | number | null;
  readonly autoIncrement?: boolean;
  readonly unique?: boolean;
}

export interface TableDefinition {
  readonly name: string;
  readonly columns: Record<string, ColumnDefinition>;
}

export interface IndexDefinition {
  readonly name: string;
  readonly table: string;
  readonly columns: string[];
  readonly unique?: boolean;
}

export interface SchemaDefinition {
  readonly version: number;
  readonly tables: Record<string, TableDefinition>;
  readonly indexes: IndexDefinition[];
}

export interface MigrationStep {
  readonly from: number;
  readonly to: number;
  readonly up: string[];
}
