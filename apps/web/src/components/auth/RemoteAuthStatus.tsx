import { useEffect, useState } from 'react';
import { Cloud, LogOut, Plug, RefreshCw } from 'lucide-react';
import { useRemoteAuth } from '../../providers/RemoteAuthProvider';
import { Button } from '../ui/button';
import { RemoteAuthModal } from './RemoteAuthModal';

export function RemoteAuthStatus() {
  const { state, logOut, clearError } = useRemoteAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<'login' | 'signup'>('signup');

  useEffect(() => {
    if (state.status === 'connected') {
      setModalOpen(false);
    }
  }, [state.status]);

  // Errors are surfaced inline inside the modal; avoid double toasts here.

  const openModal = (tab: 'login' | 'signup') => {
    clearError();
    setInitialTab(tab);
    setModalOpen(true);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        {state.status === 'connected' ? (
          <div className="flex items-center gap-2 rounded-full border border-green-700 bg-green-800 px-3 py-1 text-sm text-white shadow-sm">
            <Cloud className="h-4 w-4 text-white" />
            <span className="font-medium text-white">Connected</span>
            <span className="text-xs text-white/80">
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
          </div>
        )}
      </div>
      <RemoteAuthModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={initialTab}
      />
    </>
  );
}
