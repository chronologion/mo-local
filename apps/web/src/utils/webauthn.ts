/**
 * Get the WebAuthn Relying Party ID based on current hostname.
 * Uses 'localhost' for local development, otherwise uses the actual hostname.
 */
export const getWebAuthnRpId = (): string => {
  return window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;
};
