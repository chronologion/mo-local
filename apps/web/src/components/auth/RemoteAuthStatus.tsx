import { useEffect, useState } from 'react';
import { Cloud, LogOut, Plug, RefreshCw, UserRound } from 'lucide-react';
import { useRemoteAuth } from '../../providers/RemoteAuthProvider';
import { Button } from '../ui/button';
import { RemoteAuthModal } from './RemoteAuthModal';

export function RemoteAuthStatus() {
  const { state, logOut, error, clearError } = useRemoteAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<'login' | 'signup'>('signup');

  useEffect(() => {
    if (state.status === 'connected') {
      setModalOpen(false);
    }
  }, [state.status]);

  const openModal = (tab: 'login' | 'signup') => {
    clearError();
    setInitialTab(tab);
    setModalOpen(true);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        {state.status === 'connected' ? (
          <div className="flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-sm text-green-200">
            <Cloud className="h-4 w-4" />
            <span>Connected</span>
            <span className="text-xs text-green-100/80">
              {state.email ?? state.identityId}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logOut()}
              className="ml-1 h-7 px-2 text-xs"
            >
              <LogOut className="mr-1 h-3 w-3" />
              Logout
            </Button>
          </div>
        ) : state.status === 'connecting' ? (
          <div className="flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-1 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
            Connecting…
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openModal('signup')}
              className="flex items-center gap-1 text-sm"
            >
              <Plug className="h-4 w-4 text-accent2" />
              Connect to cloud
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openModal('login')}
              className="flex items-center gap-1 text-sm"
            >
              <UserRound className="h-4 w-4 text-foreground" />
              Login
            </Button>
          </div>
        )}
        {error ? (
          <span className="text-xs text-amber-300">
            {error} — reconnect to continue
          </span>
        ) : null}
      </div>
      <RemoteAuthModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={initialTab}
      />
    </>
  );
}
