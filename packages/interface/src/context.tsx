import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type {
  CommandResult,
  GoalCommand,
  GoalCommandResult,
  GoalQuery,
  GoalQueryResult,
  IBus,
  ProjectCommand,
  ProjectCommandResult,
  ProjectQuery,
  ProjectQueryResult,
} from '@mo/application';

export type InterfaceSession =
  | { status: 'loading' }
  | { status: 'needs-onboarding' }
  | { status: 'locked'; userId: string }
  | { status: 'ready'; userId: string };

export interface GoalProjectionPort {
  whenReady(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface ProjectProjectionPort {
  whenReady(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface InterfaceServices {
  goalCommandBus: IBus<GoalCommand, CommandResult<GoalCommandResult>>;
  goalQueryBus: IBus<GoalQuery, GoalQueryResult>;
  projectCommandBus: IBus<ProjectCommand, CommandResult<ProjectCommandResult>>;
  projectQueryBus: IBus<ProjectQuery, ProjectQueryResult>;
  goalProjection: GoalProjectionPort;
  projectProjection: ProjectProjectionPort;
}

export interface InterfaceContextValue {
  services: InterfaceServices;
  session: InterfaceSession;
}

const InterfaceContext = createContext<InterfaceContextValue | null>(null);

export type InterfaceProviderProps = {
  value: InterfaceContextValue;
  children: ReactNode;
};

export const InterfaceProvider = ({
  value,
  children,
}: InterfaceProviderProps) => (
  <InterfaceContext.Provider value={value}>
    {children}
  </InterfaceContext.Provider>
);

export const useInterface = (): InterfaceContextValue => {
  const ctx = useContext(InterfaceContext);
  if (!ctx) {
    throw new Error('InterfaceProvider is missing in the React tree');
  }
  return ctx;
};
